import { describe, expect, it } from 'vitest';
import { addDays, eachDay, weekdayOf, type IsoDate } from '@/domain/dates';
import { cyclePhase, monthInfo, resolveDay, type Override } from '@/domain/escalas/calendar';
import { generate } from '@/domain/escalas/engine';
import { parseRule } from '@/domain/escalas/rules';
import type { Absence, Grid, HoursMap, LegalParams, Member, Post, Rule } from '@/domain/escalas/types';
import { validate } from '@/domain/escalas/validate';

// Dados de TESTE (horários inventados só para exercitar o motor).
const H = (h: number, m = 0) => h * 60 + m;
const ALL: HoursMap = { 1: [[H(6), H(22)]], 2: [[H(6), H(22)]], 3: [[H(6), H(22)]], 4: [[H(6), H(22)]], 5: [[H(6), H(22)]], 6: [[H(7), H(18)]], 7: [[H(8), H(14)]] };
const CLT: LegalParams = { bond: 'CLT', validFrom: '2020-01-01', maxDailyMin: 480, maxDailyExtraMin: 120, maxWeeklyMin: 2640, minRestBetweenMin: 660, maxConsecutiveDays: 6, sundayOffEveryWeeks: null, breakLongOverMin: 360, breakLongMin: 60, breakShortOverMin: 240, breakShortMin: 15, validated: true };
/** FUNAP: contrato 6x1, 44h, até 2h de intervalo; sem domingo, interjornada nem intervalo mínimo. */
const FUNAP: LegalParams = { bond: 'FUNAP', validFrom: '2020-01-01', maxDailyMin: null, maxDailyExtraMin: null, maxWeeklyMin: 2640, minRestBetweenMin: null, maxConsecutiveDays: 6, sundayOffEveryWeeks: null, breakLongOverMin: null, breakLongMin: null, breakShortOverMin: null, breakShortMin: null, maxBreakMin: 120, validated: true };
let seq = 0;
const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
function member(name: string, o: Partial<Member> = {}): Member {
  return { id: id(), name, bond: 'CLT', mode: 'FIXO', functionName: 'Cozinha', altFunctions: [], hours: { base: [H(7), H(15, 20), 60] }, weeklyMin: 2400, fixedOff: [], availableDays: [], saturday: true, sunday: true, holiday: true, autoSchedule: true, ...o };
}
function post(name: string, s: number, e: number, o: Partial<Post> = {}): Post {
  return { id: id(), name, kind: null, startMin: s, endMin: e, weekdays: [1, 2, 3, 4, 5, 6, 7], minPeople: 1, functionName: null, mandatory: true, ...o };
}
function rule(kind: string, params: unknown, mandatory = true): Rule {
  const r = parseRule(kind, params);
  if (!r.ok) throw new Error(r.error);
  return { id: id(), kind, label: kind, params: r.params, mandatory };
}
function run(o: { year: number; month: number; members: Member[]; posts?: Post[]; rules?: Rule[]; absences?: Absence[]; hours?: HoursMap; holidays?: [IsoDate, string, string?][]; overrides?: Override[]; prior?: Grid; cycleRef?: IsoDate; edit?: (g: Grid) => void }) {
  const month = monthInfo(o.year, o.month);
  const holidays = new Map((o.holidays ?? []).map(([d, n, s]) => [d, { name: n, scope: s ?? 'NACIONAL' }]));
  const cal = { sectorId: 'S', sectorHours: o.hours ?? ALL, nacaoHours: {}, holidays, overrides: o.overrides ?? [] };
  const days = new Map(eachDay(month.rangeStart, month.rangeEnd).map((d) => [d, resolveDay(d, cal)]));
  const base = { month, days, members: o.members, posts: o.posts ?? [], rules: o.rules ?? [], absences: o.absences ?? [], cycleRef: o.cycleRef ?? '2026-10-05' };
  const g = generate({ ...base, prior: o.prior ?? {} });
  o.edit?.(g.grid);
  const a = validate({ ...base, grid: g.grid, legal: { CLT, FUNAP } });
  return { month, days, grid: g.grid, engineAlerts: g.alerts, analysis: a };
}
const worked = (g: Grid, mid: string, ds: IsoDate[]) => ds.filter((d) => g[mid]![d]!.kind === 'TRABALHO').length;

describe('calendário real', () => {
  it('meses de 28, 29, 30 e 31 dias, com o dia da semana certo', () => {
    expect(monthInfo(2026, 2).length).toBe(28);
    expect(monthInfo(2028, 2).length).toBe(29);
    const nov = monthInfo(2026, 11);
    expect(nov.length).toBe(30);
    expect(weekdayOf(nov.first)).toBe(7); // 1º/11/2026 é domingo
    expect(nov.weekdayCount[7]).toBe(5);
    expect(Object.values(nov.weekdayCount).reduce((a, b) => a + b, 0)).toBe(30);
    expect(monthInfo(2027, 1).length).toBe(31);
    // A semana atravessa o mês: começa na segunda 26/10.
    expect(nov.rangeStart).toBe('2026-10-26');
    expect(nov.rangeEnd).toBe('2026-12-06');
  });
  it('ciclo A/B continua entre meses (não reinicia no dia 1º)', () => {
    const ref = '2026-10-05';
    expect(cyclePhase('2026-10-26', ref)).toBe('B');
    expect(cyclePhase('2026-11-01', ref)).toBe('B'); // domingo da mesma semana
    expect(cyclePhase('2026-11-02', ref)).toBe('A');
    expect(cyclePhase('2026-09-28', ref)).toBe('B');
  });
  it('prioridade: exceção do setor > especial da Nação > feriado > habitual > Nação', () => {
    const base = { sectorId: 'S', sectorHours: { ...ALL, F: [[H(8), H(12)]] } as HoursMap, nacaoHours: { 1: [[H(5), H(23)]] } as HoursMap, holidays: new Map([['2026-11-02', { name: 'Finados', scope: 'NACIONAL' }]]), overrides: [] as Override[] };
    expect(resolveDay('2026-11-02', base).open).toEqual([[H(8), H(12)]]);
    expect(resolveDay('2026-11-02', base).source).toBe('SETOR_FERIADO');
    const nacao = { ...base, overrides: [{ date: '2026-11-03', sectorId: null, closed: false, hours: [[H(8), H(16)]], reason: 'Manutenção' }] as Override[] };
    const d = resolveDay('2026-11-03', nacao);
    expect(d.open).toEqual([[H(8), H(16)]]);
    expect(d.confirm.length).toBe(1); // o setor abre 06–22: pede confirmação
    const setor = { ...nacao, overrides: [...nacao.overrides, { date: '2026-11-03', sectorId: 'S', closed: true, hours: null, reason: 'Dedetização' }] };
    expect(resolveDay('2026-11-03', setor).open).toEqual([]);
    // Feriado sem horário de feriado: não vira folga nem dia normal sem aviso.
    const semF = { ...base, sectorHours: ALL };
    const f = resolveDay('2026-11-02', semF);
    expect(f.open.length).toBe(1);
    expect(f.confirm[0]).toMatch(/Feriado/);
    // Sem horário do setor: usa o geral da Nação.
    const soNacao = { ...base, sectorHours: {} };
    expect(resolveDay('2026-11-09', soNacao).source).toBe('NACAO');
  });
});

describe('motor de geração', () => {
  it('CLT 5x2: duas folgas por semana e cobertura mantida', () => {
    const team = ['Ana', 'Bia', 'Cris', 'Dani'].map((n) => member(n));
    const r = run({ year: 2026, month: 11, members: team, posts: [post('Abertura', H(7), H(10), { kind: 'ABERTURA', minPeople: 2 })] });
    for (const m of team) for (const w of r.month.weeks) expect(worked(r.grid, m.id, w.days)).toBe(5);
    expect(r.analysis.uncovered).toEqual([]);
  });

  it('Cozinha: folgas fixas, equipes alternando fim de semana com compensação, sem duas folgas no mesmo dia útil', () => {
    const fia = member('Fia', { fixedOff: [2, 7] });
    const cal = member('Caliane', { fixedOff: [3] });
    const tati = member('Tati', { fixedOff: [4] });
    const ren = member('Renata', { fixedOff: [1] });
    const tam = member('Tati Amorim', { fixedOff: [5] });
    const all = [fia, cal, tati, ren, tam];
    const rules = [
      rule('ALTERNAR_FIM_DE_SEMANA', { groupA: [cal.id, tati.id], groupB: [ren.id, tam.id], weekdays: [6, 7], compensate: true }),
      rule('EVITAR_FOLGA_JUNTA', { memberIds: all.map((m) => m.id), weekdays: [1, 2, 3, 4, 5] }, false),
      rule('TRABALHA_SEMPRE', { memberId: fia.id, weekdays: [1, 3, 4, 5, 6] }),
    ];
    const r = run({ year: 2026, month: 11, members: all, rules, posts: [post('Almoço', H(10), H(14), { kind: 'ALMOCO', minPeople: 2 })] });
    // Fia: segunda, quarta, quinta, sexta e sábado.
    for (const d of r.month.days) expect(r.grid[fia.id]![d]!.kind === 'TRABALHO').toBe([1, 3, 4, 5, 6].includes(weekdayOf(d)));
    // Revezamento: na semana A trabalham Caliane e Tati no fim de semana; na B, Renata e Tati Amorim.
    for (const d of r.month.days.filter((x) => weekdayOf(x) >= 6)) {
      const phase = cyclePhase(d, '2026-10-05');
      expect(r.grid[cal.id]![d]!.kind).toBe(phase === 'A' ? 'TRABALHO' : 'FOLGA');
      expect(r.grid[ren.id]![d]!.kind).toBe(phase === 'B' ? 'TRABALHO' : 'FOLGA');
    }
    // Média 5x2 na quinzena: 6 dias na semana do fim de semana, 4 na outra.
    const w = r.month.weeks[1]!;
    expect(worked(r.grid, cal.id, w.days) + worked(r.grid, cal.id, r.month.weeks[2]!.days)).toBe(10);
    expect(r.analysis.alerts.filter((a) => a.code === 'REGRA')).toEqual([]);
    expect(r.analysis.classification).toBe('SEM_CONFLITOS');
  });

  it('ciclo A/B atravessando meses: o mês seguinte continua do anterior', () => {
    const a = member('Junior', { functionName: 'Limpeza' });
    const b = member('Carlos', { functionName: 'Limpeza' });
    const rules = [rule('ALTERNAR_FIM_DE_SEMANA', { groupA: [a.id], groupB: [b.id], weekdays: [6], compensate: false })];
    const oct = run({ year: 2026, month: 10, members: [a, b], rules, hours: { ...ALL, 7: [] } });
    // Último sábado de outubro (31/10) é semana B → Carlos.
    expect(oct.grid[b.id]!['2026-10-31']!.kind).toBe('TRABALHO');
    const prior: Grid = {};
    for (const m of [a, b]) prior[m.id] = Object.fromEntries(oct.month.days.map((d) => [d, oct.grid[m.id]![d]!]));
    const nov = run({ year: 2026, month: 11, members: [a, b], rules, hours: { ...ALL, 7: [] }, prior });
    // 1º sábado de novembro (07/11) é semana A → Junior; e os dias de outubro ficam como estavam.
    expect(nov.grid[a.id]!['2026-11-07']!.kind).toBe('TRABALHO');
    expect(nov.grid[b.id]!['2026-11-07']!.kind).toBe('FOLGA');
    expect(nov.grid[b.id]!['2026-10-31']).toEqual(oct.grid[b.id]!['2026-10-31']);
    // Semana 26/10–01/11 conta os dias de outubro: 5 dias trabalhados no total.
    expect(worked(nov.grid, b.id, nov.month.weeks[0]!.days)).toBe(5);
  });

  it('férias e atestado: a pessoa sai da escala; freelancer cobre no dia disponível; o resto vira conflito com sugestão', () => {
    const fia = member('Fia', { fixedOff: [2, 7] });
    const outra = member('Caliane', { fixedOff: [3, 7] });
    const ed = member('Edilene', { bond: 'FREELANCER', mode: 'COBERTURA', availableDays: [2], hours: {} });
    const absences: Absence[] = [{ memberId: fia.id, start: '2026-11-09', end: '2026-11-22', type: 'FERIAS' }, { memberId: outra.id, start: '2026-11-10', end: '2026-11-10', type: 'ATESTADO' }];
    const r = run({ year: 2026, month: 11, members: [fia, outra, ed], absences, posts: [post('Almoço', H(10), H(14), { kind: 'ALMOCO', weekdays: [1, 2, 3, 4, 5, 6] })] });
    expect(r.grid[fia.id]!['2026-11-12']!.kind).toBe('FERIAS');
    expect(r.grid[outra.id]!['2026-11-10']!.kind).toBe('ATESTADO');
    // Terça 10/11: as duas fora → Edilene (freelancer, terças) cobre.
    expect(r.grid[ed.id]!['2026-11-10']!.kind).toBe('TRABALHO');
    expect(r.grid[ed.id]!['2026-11-10']!.note).toMatch(/Cobertura/);
    // Ausências simultâneas sem cobertura possível → conflito (não inventa ninguém).
    expect(r.analysis.classification).toBe('COM_CONFLITO');
    expect(r.analysis.uncovered.length).toBeGreaterThan(0);
    expect(r.analysis.members.find((m) => m.memberId === fia.id)!.absenceDays).toBe(14);
  });

  it('turno sem responsável pela abertura ou pelo fechamento vira conflito', () => {
    const m = member('Recep', { hours: { base: [H(8), H(16, 20), 60] } });
    const r = run({ year: 2026, month: 11, members: [m], posts: [post('Abertura', H(6), H(8), { kind: 'ABERTURA' }), post('Fechamento', H(20), H(22), { kind: 'FECHAMENTO', weekdays: [1, 2, 3, 4, 5] })] });
    expect(r.analysis.classification).toBe('COM_CONFLITO');
    expect(r.analysis.totals.opening.covered).toBe(0);
    expect(r.analysis.totals.closing.total).toBe(21);
    expect(r.analysis.alerts.some((a) => a.code === 'DESCOBERTO' && /Fechamento/.test(a.message))).toBe(true);
  });

  it('feriado fechado, evento com reforço e mudança de horário', () => {
    const team = ['Ana', 'Bia'].map((n) => member(n, { hours: { base: [H(6), H(14, 20), 60] } }));
    const r = run({
      year: 2026, month: 11, members: team, hours: { ...ALL, F: [] }, holidays: [['2026-11-02', 'Finados'], ['2026-11-20', 'Consciência Negra']],
      overrides: [
        { date: '2026-11-07', sectorId: null, closed: false, hours: null, reason: 'Nação Celebration', eventName: 'Nação Celebration', extraPeople: 2 },
        { date: '2026-11-11', sectorId: 'S', closed: false, hours: [[H(8), H(12)]], reason: 'Horário reduzido' },
      ],
    });
    for (const m of team) expect(r.grid[m.id]!['2026-11-02']!.kind).toBe('FECHADO');
    expect(r.analysis.alerts.some((a) => a.code === 'EVENTO' && a.date === '2026-11-07')).toBe(true);
    const c = team.map((m) => r.grid[m.id]!['2026-11-11']!).find((x) => x.kind === 'TRABALHO')!;
    expect([c.startMin, c.endMin]).toEqual([H(8), H(12)]);
  });

  it('edição manual é revalidada: trabalhar na folga fixa, ausente escalado e interjornada', () => {
    const a = member('Ana', { fixedOff: [2] });
    const b = member('Bia', { hours: { base: [H(14), H(22, 20), 60] } });
    const r = run({
      year: 2026, month: 11, members: [a, b], absences: [{ memberId: b.id, start: '2026-11-16', end: '2026-11-16', type: 'FALTA' }],
      edit: (g) => {
        g[a.id]!['2026-11-03'] = { kind: 'TRABALHO', startMin: H(7), endMin: H(15, 20), breakMin: 60, manual: true };
        g[b.id]!['2026-11-16'] = { kind: 'TRABALHO', startMin: H(14), endMin: H(22, 20), breakMin: 60, manual: true };
        g[b.id]!['2026-11-12'] = { kind: 'TRABALHO', startMin: H(14), endMin: H(22, 20), breakMin: 60 };
        g[b.id]!['2026-11-13'] = { kind: 'TRABALHO', startMin: H(6), endMin: H(14, 20), breakMin: 60 };
      },
    });
    const codes = r.analysis.alerts.map((x) => x.code);
    expect(codes).toContain('FOLGA_FIXA');
    expect(codes).toContain('AUSENTE_ESCALADO');
    expect(codes).toContain('INTERJORNADA');
    expect(r.analysis.classification).toBe('COM_CONFLITO');
  });

  it('parâmetros legais não validados nunca dão "sem conflitos"', () => {
    const month = monthInfo(2026, 11);
    const days = new Map(eachDay(month.rangeStart, month.rangeEnd).map((d) => [d, resolveDay(d, { sectorId: 'S', sectorHours: ALL, nacaoHours: {}, holidays: new Map(), overrides: [] })]));
    const m = member('Ana');
    const base = { month, days, members: [m], posts: [], rules: [], absences: [], cycleRef: '2026-10-05' };
    const g = generate({ ...base, prior: {} });
    expect(validate({ ...base, grid: g.grid, legal: { CLT: { ...CLT, validated: false } } }).classification).toBe('AJUSTES');
    expect(validate({ ...base, grid: g.grid, legal: {} }).alerts.some((a) => a.code === 'LEGAL_PENDENTE')).toBe(true);
  });

  it('MEI não entra no 5x2 e cobre a folga de outra pessoa', () => {
    const jess = member('Jess', { functionName: 'Atendimento', fixedOff: [7] });
    const deb = member('Débora', { functionName: 'Atendimento', fixedOff: [7] });
    const caio = member('Caio', { bond: 'MEI', functionName: 'Gerente', altFunctions: ['Atendimento'], hours: { base: [H(9), H(17), 60] }, availableDays: [2, 3, 5], autoSchedule: true, mode: 'FIXO' });
    const rules = [
      rule('ALTERNAR_FOLGA', { memberA: jess.id, memberB: deb.id, weekdays: [2, 3] }),
      rule('COBRE_FOLGA', { coverId: caio.id, coveredId: jess.id, startMin: null, endMin: null }),
    ];
    const r = run({ year: 2026, month: 11, members: [jess, deb, caio], rules, hours: { ...ALL, 7: [] } });
    // Semana A (02/11): Jess folga terça (03), Débora quarta (04); Caio cobre a terça no horário da Jess.
    expect(r.grid[jess.id]!['2026-11-03']!.kind).toBe('FOLGA');
    expect(r.grid[deb.id]!['2026-11-04']!.kind).toBe('FOLGA');
    expect(r.grid[caio.id]!['2026-11-03']!.note).toMatch(/Jess/);
    expect(r.grid[caio.id]!['2026-11-03']!.startMin).toBe(H(7));
    // Semana B (09/11): inverte.
    expect(r.grid[jess.id]!['2026-11-11']!.kind).toBe('FOLGA');
    expect(r.grid[deb.id]!['2026-11-10']!.kind).toBe('FOLGA');
    // Caio (MEI) trabalha só nos dias disponíveis, sem meta de 5 dias.
    expect(r.month.days.filter((d) => r.grid[caio.id]![d]!.kind === 'TRABALHO').every((d) => [2, 3, 5].includes(weekdayOf(d)))).toBe(true);
    expect(addDays('2026-11-03', 0)).toBe('2026-11-03');
  });

  it('FUNAP 6x1: uma folga por semana; sem domingo, interjornada e intervalo mínimo; intervalo acima de 2h acusa', () => {
    const f = member('Eliel', { bond: 'FUNAP', hours: { base: [H(7), H(15), 60] } });
    const r = run({
      year: 2026, month: 11, members: [f],
      edit: (g) => {
        g[f.id]!['2026-11-10'] = { kind: 'TRABALHO', startMin: H(14), endMin: H(22), breakMin: 0 };
        g[f.id]!['2026-11-11'] = { kind: 'TRABALHO', startMin: H(6), endMin: H(14), breakMin: 0 };
        g[f.id]!['2026-11-12'] = { kind: 'TRABALHO', startMin: H(7), endMin: H(17), breakMin: 150 };
      },
    });
    for (const w of r.month.weeks.slice(1, 4)) expect(worked(r.grid, f.id, w.days)).toBeGreaterThanOrEqual(6);
    const codes = r.analysis.alerts.filter((a) => a.memberId === f.id).map((a) => a.code);
    expect(codes).not.toContain('DOMINGO');
    expect(codes).not.toContain('INTERJORNADA');
    expect(codes).not.toContain('INTERVALO');
    expect(codes).toContain('INTERVALO_MAXIMO');
  });

  it('folga do banco de horas: justifica a regra, conta à parte e sai do saldo', () => {
    const m = member('Marcos', { hours: { base: [H(7), H(15, 20), 60] } });
    const rules = [rule('TRABALHA_SEMPRE', { memberId: m.id, weekdays: [6] })];
    const base = run({ year: 2026, month: 11, members: [m], rules });
    const r = run({ year: 2026, month: 11, members: [m], rules, edit: (g) => { g[m.id]!['2026-11-14'] = { kind: 'BANCO', manual: true }; } });
    expect(r.analysis.alerts.some((a) => a.code === 'REGRA')).toBe(false);
    const st = r.analysis.members[0]!;
    expect(st.bankDays).toBe(1);
    expect(st.absenceDays).toBe(0);
    expect(st.balanceMin!).toBeLessThan(base.analysis.members[0]!.balanceMin!);
  });
});
