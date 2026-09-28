import { describe, expect, it } from 'vitest';
import { computeLedger, type LedgerOccurrence } from '@/domain/ledger';
import { buildHoursReport, toDecimalHours } from '@/domain/report';
import { filterGrade, gradeParams } from '@/lib/grade-filter';

const occ = (id: string, modalityId: string, a: Partial<LedgerOccurrence['assignments'][number]>[], extra: Partial<LedgerOccurrence> = {}): LedgerOccurrence => ({
  id, date: '2026-09-01', modalityId, status: 'PREVISTA', plannedDurationMin: 60, durationMin: 60, countsHours: true, cancellationCountsHours: false,
  assignments: a.map((x) => ({ plannedTeacherId: null, executingTeacherId: null, status: 'PREVISTA', minutes: 60, absenceReason: null, ...x })),
  ...extra,
});

describe('relatório de horas', () => {
  const ledger = computeLedger([
    occ('1', 'cf', [{ plannedTeacherId: 'ana', executingTeacherId: 'ana' }]),
    occ('2', 'hy', [{ plannedTeacherId: 'ana', executingTeacherId: 'ana', minutes: 30 }], { plannedDurationMin: 30, durationMin: 30 }),
    occ('3', 'cf', [{ plannedTeacherId: 'ana', executingTeacherId: 'bia', status: 'SUBSTITUIDA', absenceReason: 'FALTA' }]),
    occ('4', 'cf', [{ plannedTeacherId: 'bia', executingTeacherId: 'bia' }], { status: 'CANCELADA' }),
  ]);
  const teachers = [{ id: 'ana', name: 'Ana' }, { id: 'bia', name: 'Bia' }];
  const mods = [{ id: 'cf', name: 'CrossFit', area: 'CrossFit' }, { id: 'hy', name: 'HYROX', area: 'Aulas Coletivas' }];

  it('por professor, por modalidade e cruzado — com o mesmo total', () => {
    const r = buildHoursReport(ledger, teachers, mods);
    expect(r.byTeacher.map((t) => [t.teacher, t.modalities, t.plannedMin, t.ownMin, t.substitutionMin, t.absenceMin, t.cancelledMin, t.totalMin])).toEqual([
      ['Ana', ['CrossFit', 'HYROX'], 150, 90, 0, 60, 0, 90],
      ['Bia', ['CrossFit'], 60, 0, 60, 0, 60, 60],
    ]);
    expect(r.byModality.map((m) => [m.area, m.modality, m.teachers, m.totalMin])).toEqual([
      ['Aulas Coletivas', 'HYROX', 1, 30],
      ['CrossFit', 'CrossFit', 2, 120],
    ]);
    expect(r.byTeacherModality.map((x) => `${x.teacher}/${x.modality}=${x.totalMin}`)).toEqual(['Ana/CrossFit=60', 'Ana/HYROX=30', 'Bia/CrossFit=60']);
    expect(r.totals).toMatchObject({ plannedMin: 210, totalMin: 150, absenceMin: 60, absences: { FALTA: 60 } });
    const sum = (k: 'totalMin') => r.byModality.reduce((s, m) => s + m[k], 0);
    expect(sum('totalMin')).toBe(r.totals.totalMin);
  });

  it('filtro de professor e de modalidade', () => {
    expect(buildHoursReport(ledger, teachers, mods, { teacherId: 'bia' }).byTeacher.map((t) => t.teacher)).toEqual(['Bia']);
    const onlyHy = buildHoursReport(ledger, teachers, mods, { modalityIds: new Set(['hy']) });
    expect(onlyHy.byTeacher.map((t) => [t.teacher, t.totalMin])).toEqual([['Ana', 30]]);
  });

  it('horas decimais para a contabilidade', () => {
    expect([toDecimalHours(90), toDecimalHours(30), toDecimalHours(0), toDecimalHours(100)]).toEqual([1.5, 0.5, 0, 1.67]);
  });
});

describe('filtros da grade', () => {
  const items = [
    { id: 'a', modality: { id: 'cf' }, space: { id: 's1' }, people: [{ teacherId: 'ana' }] },
    { id: 'b', modality: { id: 'hy' }, space: null, people: [{ teacherId: 'bia' }, { teacherId: 'ana' }] },
    { id: 'c', modality: { id: 'cf' }, space: { id: 's2' }, people: [] },
  ];
  it('modalidade, professor e espaço combinam', () => {
    const f = (x: Partial<{ modalityId: string; teacherId: string; spaceId: string }>) =>
      filterGrade(items, { modalityId: null, teacherId: null, spaceId: null, ...x }).map((i) => i.id);
    expect(f({})).toEqual(['a', 'b', 'c']);
    expect(f({ modalityId: 'cf' })).toEqual(['a', 'c']);
    expect(f({ teacherId: 'ana' })).toEqual(['a', 'b']);
    expect(f({ teacherId: 'ana', modalityId: 'hy' })).toEqual(['b']);
    expect(f({ spaceId: 's2' })).toEqual(['c']);
  });
  it('a URL de impressão leva os mesmos filtros', () => {
    expect(gradeParams({ date: '2026-10-01', areaId: 'x', modalityId: null, teacherId: 't', spaceId: null }).toString()).toBe('data=2026-10-01&area=x&professor=t');
  });
});
