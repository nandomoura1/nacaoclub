import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { generateSchedule, loadDocumentModels, loadMonth, setRotation } from '@/server/services/ws-service';
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

  it('Recepção: rodízio de 6 posições — folga quinta ⇒ domingo; folga sexta ⇒ sábado; qui+sex ⇒ folga no fim de semana', async () => {
    const v = await view('Recepção');
    const people = ['Duda', 'Lawana', 'Brenda', 'Manu', 'Débora', 'Igor'].map((n) => memberId(v, n));
    const k = (id: string, d: string) => v.grid[id]![d]!.kind;
    for (const w of v.month.weeks.filter((x) => x.days.every((d) => d >= v.month.first && d <= v.month.last))) {
      const [, , , qui, sex, sab, dom] = w.days as [string, string, string, string, string, string, string];
      for (const id of people) {
        if (k(id, qui) === 'FOLGA') { expect(k(id, dom)).toBe('TRABALHO'); expect(k(id, sex)).toBe('TRABALHO'); }
        if (k(id, sex) === 'FOLGA') expect(k(id, sab)).toBe('TRABALHO');
        if (k(id, qui) === 'TRABALHO' && k(id, sex) === 'TRABALHO' && k(id, dom) !== 'TRABALHO') expect(k(id, sab)).toBe('FOLGA');
      }
      // Toda semana: 1 no domingo, 2 no sábado, 5 na quinta, 4 na sexta (cobertura do documento).
      expect(people.filter((id) => k(id, dom) === 'TRABALHO').length).toBe(1);
      expect(people.filter((id) => k(id, sab) === 'TRABALHO').length).toBe(2);
      expect(people.filter((id) => k(id, qui) === 'TRABALHO').length).toBe(5);
      expect(people.filter((id) => k(id, sex) === 'TRABALHO').length).toBe(4);
      // Cada pessoa: 5 dias e 2 folgas por semana.
      for (const id of people) expect(w.days.filter((d) => k(id, d) === 'TRABALHO').length).toBe(5);
    }
    // Domingo gira: pessoas diferentes em domingos seguidos; ninguém mais em todos.
    const sundays = v.month.days.filter((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 0);
    const who = sundays.map((d) => people.find((id) => k(id, d) === 'TRABALHO'));
    expect(new Set(who).size).toBe(who.length);
    expect(v.analysis!.alerts.filter((a) => a.level === 'CONFLITO')).toEqual([]);
    expect(v.analysis!.uncovered.filter((u) => !['2026-11-02', '2026-11-15', '2026-11-20', '2026-11-30'].includes(u.date))).toEqual([]);
  });

  it('Montar rodízio: desfazer e montar de novo reproduz as posições', async () => {
    const sid = await sector('Recepção');
    const before = await prisma.wsMember.findMany({ where: { sectorId: sid }, orderBy: { sortOrder: 'asc' } });
    await setRotation(admin.principal, sid, [], META);
    const flat = await prisma.wsMember.findMany({ where: { sectorId: sid }, orderBy: { sortOrder: 'asc' } });
    expect(flat.every((m) => !(m.hours as { week?: { cycle?: unknown } }).week?.cycle)).toBe(true);
    await setRotation(admin.principal, sid, flat.map((m) => m.id), META);
    const after = await prisma.wsMember.findMany({ where: { sectorId: sid }, orderBy: { sortOrder: 'asc' } });
    expect(after.map((m) => m.hours)).toEqual(before.map((m) => m.hours));
    await expect(setRotation(admin.principal, sid, [flat[0]!.id], META)).rejects.toThrow(/2 pessoas/);
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
