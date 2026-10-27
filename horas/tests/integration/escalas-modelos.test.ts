import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { generateSchedule, loadDocumentModels, loadMonth } from '@/server/services/ws-service';
import { cyclePhase } from '@/domain/escalas/calendar';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

const H = (h: number, m = 0) => h * 60 + m;

/** Modelos do documento "Escala de Trabalho 5x2 — Nação Club": carregam e geram a grade do documento. */
describe.skipIf(!hasDb)('Modelos iniciais das escalas', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  const sector = async (name: string) => (await prisma.wsSector.findFirstOrThrow({ where: { name } })).id;
  const view = async (name: string) => loadMonth(admin.principal, await sector(name), 2026, 11);
  const memberId = (v: Awaited<ReturnType<typeof view>>, name: string) => v.members.find((m) => m.name === name)!.id;

  beforeAll(async () => {
    await ensureCatalog();
    admin = await makeUser('ADMIN');
    await prisma.wsLegalParam.deleteMany({ where: { bond: 'CLT' } });
    const r = await loadDocumentModels(admin.principal, META);
    expect(r.created.sort()).toEqual(['Cozinha', 'Lanchonete', 'Limpeza e Manutenção', 'Recepção'].filter((n) => !r.skipped.includes(n)).sort());
    for (const n of ['Recepção', 'Limpeza e Manutenção', 'Lanchonete', 'Cozinha']) await generateSchedule(admin.principal, await sector(n), 2026, 11, META);
  });

  it('é idempotente e cria os parâmetros CLT de 40h sem validar', async () => {
    expect((await loadDocumentModels(admin.principal, META)).created).toEqual([]);
    const clt = await prisma.wsLegalParam.findFirstOrThrow({ where: { bond: 'CLT' } });
    expect(clt.maxWeeklyMin).toBe(2400);
    expect(clt.validatedAt).toBeNull();
  });

  it('Recepção: grade do documento, abertura e fechamento cobertos; domingo do Igor apontado', async () => {
    const v = await view('Recepção');
    const duda = v.grid[memberId(v, 'Duda')]!;
    expect([duda['2026-11-03']!.startMin, duda['2026-11-03']!.endMin]).toEqual([H(5), H(13)]);
    expect([duda['2026-11-06']!.startMin, duda['2026-11-06']!.endMin]).toEqual([H(5), H(14)]);
    expect(duda['2026-11-07']!.kind).toBe('FOLGA');
    const igor = v.grid[memberId(v, 'Igor')]!;
    expect([igor['2026-11-08']!.startMin, igor['2026-11-08']!.breakMin]).toEqual([H(8), 15]);
    expect(v.analysis!.uncovered.filter((u) => !['2026-11-02', '2026-11-15', '2026-11-20', '2026-11-30'].includes(u.date))).toEqual([]);
    expect(v.analysis!.alerts.some((a) => a.code === 'DOMINGO' && a.memberId === memberId(v, 'Igor'))).toBe(true);
    const st = v.analysis!.members.find((m) => m.name === 'Duda')!;
    expect(st.days).toBeGreaterThanOrEqual(19);
  });

  it('Limpeza: Marcos todo sábado; Junior × Carlos e Lu × Kelly alternam; John fora da geração', async () => {
    const v = await view('Limpeza e Manutenção');
    for (const d of ['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28']) {
      expect(v.grid[memberId(v, 'Marcos')]![d]!.kind).toBe('TRABALHO');
      const a = cyclePhase(d, '2026-11-02') === 'A';
      expect(v.grid[memberId(v, 'Carlos')]![d]!.kind).toBe(a ? 'TRABALHO' : 'FOLGA');
      expect(v.grid[memberId(v, 'Junior')]![d]!.kind).toBe(a ? 'FOLGA' : 'TRABALHO');
      expect(v.grid[memberId(v, 'Lu')]![d]!.kind).toBe(a ? 'TRABALHO' : 'FOLGA');
    }
    expect(v.grid[memberId(v, 'John')]!['2026-11-03']!.kind).toBe('SEM_GRADE');
    expect(v.analysis!.alerts.filter((x) => x.code === 'REGRA')).toEqual([]);
    expect(v.analysis!.alerts.some((x) => x.code === 'LEGAL_PENDENTE' && /FUNAP/.test(x.message))).toBe(true);
  });

  it('Lanchonete: Jess e Débora alternam terça/quarta e o Caio abre quando a Jess folga', async () => {
    const v = await view('Lanchonete');
    const jess = v.grid[memberId(v, 'Jess')]!;
    const caio = v.grid[memberId(v, 'Caio')]!;
    expect(jess['2026-11-03']!.kind).toBe('FOLGA'); // terça, semana A
    expect(caio['2026-11-03']!.startMin).toBe(H(7));
    expect(jess['2026-11-11']!.kind).toBe('FOLGA'); // quarta, semana B
    expect(caio['2026-11-11']!.startMin).toBe(H(7));
    expect(v.analysis!.alerts.filter((x) => x.code === 'REGRA')).toEqual([]);
    expect(v.analysis!.uncovered.filter((u) => !['2026-11-02', '2026-11-15', '2026-11-20', '2026-11-30'].includes(u.date))).toEqual([]);
  });

  it('Cozinha: 4 CLT por dia útil, equipes alternando o fim de semana e Edilene no almoço de terça', async () => {
    const v = await view('Cozinha');
    const clt = ['Fia', 'Caliane', 'Tati', 'Renata', 'Tati Amorim'].map((n) => memberId(v, n));
    for (const d of ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09']) {
      expect(clt.filter((id) => v.grid[id]![d]!.kind === 'TRABALHO').length).toBe(4);
    }
    expect(v.grid[memberId(v, 'Caliane')]!['2026-11-07']!.kind).toBe('TRABALHO'); // sábado A
    expect(v.grid[memberId(v, 'Renata')]!['2026-11-08']!.kind).toBe('TRABALHO'); // domingo A
    expect(v.grid[memberId(v, 'Renata')]!['2026-11-14']!.kind).toBe('TRABALHO'); // sábado B
    expect(v.grid[memberId(v, 'Caliane')]!['2026-11-15']!.kind).toBe('TRABALHO'); // domingo B (feriado)
    expect(v.grid[memberId(v, 'Edilene')]!['2026-11-10']!.note).toMatch(/almoço/i);
    expect(v.analysis!.alerts.filter((x) => x.code === 'REGRA')).toEqual([]);
    const fia = v.analysis!.members.find((m) => m.name === 'Fia')!;
    expect(fia.days).toBeGreaterThanOrEqual(20);
  });
});
