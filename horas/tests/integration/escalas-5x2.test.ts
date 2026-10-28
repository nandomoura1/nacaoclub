import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { saveSector as saveProcSector } from '@/server/services/proc-service';
import {
  cancelAbsence, editCell, generateSchedule, listSectors, loadMonth, saveAbsence, saveLegal, saveMember, saveOverride, savePost, saveRule, saveSector,
  setScheduleStatus, swapCells,
} from '@/server/services/ws-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

const H = (h: number, m = 0) => h * 60 + m;
const OPEN = { 1: [[H(6), H(22)]], 2: [[H(6), H(22)]], 3: [[H(6), H(22)]], 4: [[H(6), H(22)]], 5: [[H(6), H(22)]], 6: [[H(7), H(18)]], 7: [[H(8), H(14)]] };
const CLT = { bond: 'CLT', validFrom: '2020-01-01', maxDailyMin: 480, maxDailyExtraMin: 120, maxWeeklyMin: 2640, minRestBetweenMin: 660, maxConsecutiveDays: 6, sundayOffEveryWeeks: null, breakLongOverMin: 360, breakLongMin: 60, breakShortOverMin: 240, breakShortMin: 15, notes: null, validated: true };

/** Escalas de Trabalho 5x2: cadastro, geração, edição, aprovação/publicação e ausência depois de publicada. */
describe.skipIf(!hasDb)('Escalas de Trabalho 5x2', () => {
  const tag = Math.random().toString(36).slice(2, 7);
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  let outro: Awaited<ReturnType<typeof makeUser>>;
  let sector = '';
  const members: string[] = [];

  // Feriados de nov/dez que outros testes deixam no banco mudariam a escala: saem durante este teste e voltam no fim.
  let parked: { date: Date; name: string; scope: 'NACIONAL' | 'DISTRITAL' | 'FACULTATIVO' | 'NACAO'; policy: 'CANCELAR_TODAS' | 'MANTER_TODAS' | 'DECIDIR_INDIVIDUALMENTE' }[] = [];
  const range = { gte: new Date('2026-10-26T00:00:00Z'), lte: new Date('2027-01-10T00:00:00Z') };
  afterAll(async () => { for (const h of parked) await prisma.holiday.upsert({ where: { date: h.date }, update: {}, create: h }); });

  beforeAll(async () => {
    parked = await prisma.holiday.findMany({ where: { date: range, occurrences: { none: {} } }, select: { date: true, name: true, scope: true, policy: true } });
    await prisma.holiday.deleteMany({ where: { date: range, occurrences: { none: {} } } });
    await ensureCatalog();
    admin = await makeUser('ADMIN'); lider = await makeUser('LIDER'); outro = await makeUser('LIDER');
    const proc = await saveProcSector(admin.principal, null, { name: `Cozinha ${tag}`, description: null, leaderId: lider.principal.id, taskUrl: null, sortOrder: 90, active: true }, META);
    sector = await saveSector(admin.principal, null, { name: `Cozinha ${tag}`, procSectorId: proc, hours: OPEN, cycleRef: '2026-10-07', notes: null }, META);
    await saveLegal(admin.principal, null, CLT, META).catch(() => undefined); // pode já existir de outra execução
  });

  it('líder monta a equipe do setor que lidera; outro líder não enxerga', async () => {
    await expect(saveSector(lider.principal, null, { name: 'X', hours: {}, cycleRef: '2026-10-05' }, META)).rejects.toBeInstanceOf(AuthorizationError);
    expect((await listSectors(lider.principal)).map((s) => s.id)).toEqual([sector]);
    expect(await listSectors(outro.principal)).toEqual([]);
    await expect(saveMember(outro.principal, sector, null, { newName: 'Intrusa', bond: 'CLT', hours: { base: [H(7), H(15, 20), 60] } }, META)).rejects.toThrow(/lidera/);

    const base = { bond: 'CLT', functionName: 'Cozinheira', hours: { base: [H(7), H(15, 20), 60] } };
    for (const [n, off] of [['Fia', [2, 7]], ['Caliane', [3]], ['Tati', [4]], ['Renata', [1]]] as const) {
      members.push(await saveMember(lider.principal, sector, null, { ...base, newName: `${n} ${tag}`, fixedOff: [...off] }, META));
    }
    await expect(saveMember(lider.principal, sector, null, { newName: 'Sem horário', bond: 'CLT' }, META)).rejects.toThrow(/horário habitual/);
    await savePost(lider.principal, sector, null, { name: 'Almoço', kind: 'ALMOCO', startMin: H(10), endMin: H(14), weekdays: [1, 2, 3, 4, 5, 6], minPeople: 2 }, META);
    await saveRule(lider.principal, sector, null, { kind: 'ALTERNAR_FIM_DE_SEMANA', params: { groupA: [members[1]], groupB: [members[3]], weekdays: [6, 7], compensate: true }, mandatory: true }, META);
    await expect(saveRule(lider.principal, sector, null, { kind: 'FOLGA_FIXA', params: { memberId: '00000000-0000-4000-8000-000000000000', weekdays: [1] }, mandatory: true }, META)).rejects.toThrow(/equipe/);
  });

  it('gera o mês real, salva rascunho, edita, aprova, publica e mantém o ciclo no mês seguinte', async () => {
    const g = await generateSchedule(lider.principal, sector, 2026, 11, META);
    const view = await loadMonth(lider.principal, sector, 2026, 11);
    expect(view.month.length).toBe(30);
    expect(Object.keys(view.grid[members[0]!]!).filter((d) => d.startsWith('2026-11')).length).toBe(30);
    expect(view.schedule!.status).toBe('RASCUNHO');
    expect(g.classification).toBeDefined();

    // Edição manual na folga fixa da Fia (terça 03/11) → conflito; desfaz.
    let a = await editCell(lider.principal, view.schedule!.id, members[0]!, '2026-11-03', { kind: 'TRABALHO', startMin: H(7), endMin: H(15, 20), breakMin: 60 }, META);
    expect(a.classification).toBe('COM_CONFLITO');
    await expect(setScheduleStatus(admin.principal, view.schedule!.id, 'APROVADA', META)).rejects.toThrow(/conflito/);
    a = await editCell(lider.principal, view.schedule!.id, members[0]!, '2026-11-03', { kind: 'FOLGA' }, META);
    expect(a.alerts.some((x) => x.code === 'FOLGA_FIXA')).toBe(false);
    // Troca de folga e volta.
    await swapCells(lider.principal, view.schedule!.id, { memberId: members[1]!, date: '2026-11-09' }, { memberId: members[1]!, date: '2026-11-11' }, META);
    await swapCells(lider.principal, view.schedule!.id, { memberId: members[1]!, date: '2026-11-09' }, { memberId: members[1]!, date: '2026-11-11' }, META);

    // Líder não aprova; a gestão aprova e publica quando não há conflito impeditivo.
    await expect(setScheduleStatus(lider.principal, view.schedule!.id, 'APROVADA', META)).rejects.toBeInstanceOf(AuthorizationError);
    const now = await loadMonth(admin.principal, sector, 2026, 11);
    expect(now.analysis!.alerts.filter((x) => x.level === 'CONFLITO').map((x) => x.message)).toEqual([]);
    {
      await expect(setScheduleStatus(admin.principal, view.schedule!.id, 'PUBLICADA', META)).rejects.toThrow(/Aprove/);
      await setScheduleStatus(admin.principal, view.schedule!.id, 'APROVADA', META);
      await setScheduleStatus(admin.principal, view.schedule!.id, 'PUBLICADA', META);
      await expect(generateSchedule(lider.principal, sector, 2026, 11, META)).rejects.toThrow(/Reabra/);
      await expect(editCell(lider.principal, view.schedule!.id, members[0]!, '2026-11-04', { kind: 'FOLGA' }, META)).rejects.toThrow(/reabra/);
    }

    // Ausência lançada depois: a escala publicada não muda, mas a análise mostra o conflito e sugere substituto.
    const workDay = Object.entries(view.grid[members[2]!]!).find(([d, c]) => d >= '2026-11-16' && c.kind === 'TRABALHO')![0];
    const leave = await saveAbsence(lider.principal, sector, { memberId: members[2]!, type: 'ATESTADO', startDate: workDay, endDate: workDay }, META);
    const after = await loadMonth(lider.principal, sector, 2026, 11);
    expect(after.grid[members[2]!]![workDay]!.kind).toBe('TRABALHO');
    const alert = after.analysis!.alerts.find((x) => x.code === 'AUSENTE_ESCALADO' && x.date === workDay)!;
    expect(alert.suggestions!.length).toBeGreaterThan(0);
    await cancelAbsence(lider.principal, sector, leave.id, META);

    // Dezembro continua o ciclo A/B de novembro (fase pela data de referência).
    await generateSchedule(lider.principal, sector, 2026, 12, META);
    const dec = await loadMonth(lider.principal, sector, 2026, 12);
    const sat = '2026-12-05';
    const nov28 = after.grid[members[1]!]!['2026-11-28']!.kind;
    expect(dec.grid[members[1]!]![sat]!.kind).not.toBe(nov28 === 'TRABALHO' ? 'TRABALHO' : 'FOLGA');
  });

  it('evento pede reforço sem mudar a escala; Nação inteira só a gestão altera', async () => {
    await expect(saveOverride(lider.principal, null, { date: '2026-11-07', sectorId: null, reason: 'Celebration', extraPeople: 2 }, META)).rejects.toThrow(/gestão/);
    await saveOverride(lider.principal, null, { date: '2026-11-07', sectorId: sector, reason: `Nação Celebration ${tag}`, extraPeople: 2 }, META);
    const v = await loadMonth(lider.principal, sector, 2026, 11);
    expect(v.analysis!.alerts.some((a) => a.code === 'EVENTO' && a.date === '2026-11-07')).toBe(true);
    expect(await prisma.wsCell.count({ where: { schedule: { sectorId: sector, year: 2026, month: 11 }, note: { contains: 'Celebration' } } })).toBe(0);
  });
});
