import { describe, expect, it } from 'vitest';
import { expandGrade, type GradeVersion, type HolidayInfo, type PlannedOccurrence } from '@/domain/calendar';
import { computeLedger, type LedgerOccurrence } from '@/domain/ledger';
import { periodBounds, periodOf, weekdayCounts } from '@/domain/period';

/** Cenários obrigatórios do briefing (§35) sobre o domínio puro. */

const CORTE = 26;
const HYROX = 'hyrox';
const CROSSFIT = 'crossfit';
const FUNCIONAL = 'funcional';
const MOBILIDADE = 'mobilidade';

function version(p: Partial<GradeVersion> & Pick<GradeVersion, 'id' | 'weekday' | 'modalityId' | 'people'>): GradeVersion {
  return {
    slotId: p.id, startMin: 300, durationMin: 60, validFrom: '2026-01-01', validTo: null,
    activityTypeId: 'aula', spaceId: null, label: null, ...p,
  };
}
const rafael = [{ teacherId: 'rafael', role: 'TITULAR' as const }];

function toLedger(occ: PlannedOccurrence[], opts: { countsHours?: (o: PlannedOccurrence) => boolean } = {}): LedgerOccurrence[] {
  return occ.map((o, i) => ({
    id: `o${i}`, date: o.date, modalityId: o.modalityId, status: o.status,
    plannedDurationMin: o.durationMin, durationMin: o.durationMin,
    countsHours: opts.countsHours ? opts.countsHours(o) : true, cancellationCountsHours: false,
    assignments: o.people.map((p) => ({ plannedTeacherId: p.teacherId, executingTeacherId: p.teacherId, status: 'PREVISTA' as const, minutes: o.durationMin, absenceReason: null })),
  }));
}
const hoursOf = (ledger: ReturnType<typeof computeLedger>, id: string) => ledger.find((t) => t.teacherId === id);

describe('competência 26 → 25', () => {
  it('Setembro/2026 = 26/08 a 25/09; a planilha digitava 4·4·5·5·5·4·4, o sistema calcula', () => {
    const p = periodBounds(2026, 9, CORTE);
    expect(p).toMatchObject({ start: '2026-08-26', end: '2026-09-25' });
    expect(weekdayCounts(p.start, p.end)).toEqual({ 1: 4, 2: 4, 3: 5, 4: 5, 5: 5, 6: 4, 7: 4 });
  });
  it('virada de ano e fronteira 25/26', () => {
    expect(periodBounds(2027, 1, CORTE)).toMatchObject({ start: '2026-12-26', end: '2027-01-25' });
    expect(periodOf('2026-09-25', CORTE)).toEqual({ year: 2026, month: 9 });
    expect(periodOf('2026-09-26', CORTE)).toEqual({ year: 2026, month: 10 });
    expect(periodOf('2026-12-31', CORTE)).toEqual({ year: 2027, month: 1 });
  });
  it('corte 1 = mês civil', () => {
    expect(periodBounds(2028, 2, 1)).toMatchObject({ start: '2028-02-01', end: '2028-02-29' });
  });
});

describe('Cenário 1 — Rafael dá HYROX toda segunda, 1h; 5 segundas na competência', () => {
  it('Novembro/2026 (26/10–25/11) tem 5 segundas → 5h', () => {
    const range = periodBounds(2026, 11, CORTE);
    const occ = expandGrade(range, [version({ id: 's1', weekday: 1, modalityId: HYROX, people: rafael })], []);
    expect(occ.map((o) => o.date)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
    expect(hoursOf(computeLedger(toLedger(occ)), 'rafael')).toMatchObject({ plannedMin: 300, ownMin: 300, totalMin: 300 });
  });
});

describe('Cenário 2 — uma das segundas é feriado com aula cancelada', () => {
  const range = periodBounds(2026, 11, CORTE);
  const finados: HolidayInfo = { id: 'finados', date: '2026-11-02', policy: 'CANCELAR_TODAS' };
  const occ = expandGrade(range, [version({ id: 's1', weekday: 1, modalityId: HYROX, people: rafael })], [finados]);

  it('a aula do feriado não some: existe, cancelada, marcada com o feriado', () => {
    expect(occ).toHaveLength(5);
    expect(occ.find((o) => o.date === '2026-11-02')).toMatchObject({ status: 'CANCELADA', holidayId: 'finados', cancelledByHoliday: true });
  });
  it('→ 4h, e a hora cancelada aparece como cancelada', () => {
    expect(hoursOf(computeLedger(toLedger(occ)), 'rafael')).toMatchObject({ plannedMin: 300, ownMin: 240, cancelledMin: 60, totalMin: 240 });
  });
  it('política "decidir" deixa a aula aguardando (0h até decidir); "manter" conta normal', () => {
    const decide = expandGrade(range, [version({ id: 's1', weekday: 1, modalityId: HYROX, people: rafael })], [{ ...finados, policy: 'DECIDIR_INDIVIDUALMENTE' }]);
    expect(hoursOf(computeLedger(toLedger(decide)), 'rafael')).toMatchObject({ ownMin: 240, pendingMin: 60 });
    const keep = expandGrade(range, [version({ id: 's1', weekday: 1, modalityId: HYROX, people: rafael })], [{ ...finados, policy: 'MANTER_TODAS' }]);
    expect(hoursOf(computeLedger(toLedger(keep)), 'rafael')).toMatchObject({ ownMin: 300 });
  });
});

describe('Cenário 3 — Rafael faltou e João substituiu', () => {
  it('Rafael = 3h, João = +1h (competência com 4 segundas úteis)', () => {
    const range = periodBounds(2026, 11, CORTE);
    const occ = expandGrade(range, [version({ id: 's1', weekday: 1, modalityId: HYROX, people: rafael })], [{ id: 'f', date: '2026-11-02', policy: 'CANCELAR_TODAS' }]);
    const ledgerInput = toLedger(occ);
    const dia16 = ledgerInput.find((o) => o.date === '2026-11-16')!;
    dia16.assignments[0] = { plannedTeacherId: 'rafael', executingTeacherId: 'joao', status: 'SUBSTITUIDA', minutes: 60, absenceReason: 'FALTA' };

    const ledger = computeLedger(ledgerInput);
    expect(hoursOf(ledger, 'rafael')).toMatchObject({ totalMin: 180, absenceMin: 60, absences: { FALTA: 60 } });
    expect(hoursOf(ledger, 'joao')).toMatchObject({ plannedMin: 0, substitutionMin: 60, totalMin: 60 });
  });
});

describe('Cenário 5 — a grade muda no dia 15', () => {
  it('antes do 15 vale a antiga; do 15 em diante, a nova — sem duplicar a aula', () => {
    const range = periodBounds(2026, 10, CORTE); // 26/09 a 25/10
    const antiga = version({ id: 'v1', slotId: 'slot', weekday: 4, modalityId: HYROX, people: rafael, validTo: '2026-10-14' });
    const nova = version({ id: 'v2', slotId: 'slot', weekday: 4, modalityId: HYROX, startMin: 360, people: [{ teacherId: 'joao', role: 'TITULAR' }], validFrom: '2026-10-15' });
    const occ = expandGrade(range, [antiga, nova], []);
    // quintas: 01, 08, 15, 22/10
    expect(occ.map((o) => [o.date, o.slotVersionId, o.startMin])).toEqual([
      ['2026-10-01', 'v1', 300], ['2026-10-08', 'v1', 300], ['2026-10-15', 'v2', 360], ['2026-10-22', 'v2', 360],
    ]);
    const ledger = computeLedger(toLedger(occ));
    expect(hoursOf(ledger, 'rafael')!.totalMin).toBe(120);
    expect(hoursOf(ledger, 'joao')!.totalMin).toBe(120);
  });
});

describe('regras que a planilha não conseguia expressar', () => {
  const range = periodBounds(2026, 9, CORTE);

  it('Mobilidade de 30 min conta 0h30, não 1h', () => {
    const occ = expandGrade(range, [version({ id: 'm', weekday: 2, modalityId: MOBILIDADE, durationMin: 30, people: rafael })], []);
    expect(hoursOf(computeLedger(toLedger(occ)), 'rafael')!.totalMin).toBe(4 * 30);
  });

  it('aula com professor + auxiliar: os dois recebem a hora cheia', () => {
    const people = [{ teacherId: 'eliseu', role: 'TITULAR' as const }, { teacherId: 'luiza', role: 'AUXILIAR' as const }];
    const occ = expandGrade(range, [version({ id: 'c', weekday: 1, modalityId: CROSSFIT, people })], []);
    const ledger = computeLedger(toLedger(occ));
    expect(hoursOf(ledger, 'eliseu')!.totalMin).toBe(240);
    expect(hoursOf(ledger, 'luiza')!.totalMin).toBe(240);
  });

  it('personal não conta hora (só controle de espaço)', () => {
    const occ = expandGrade(range, [version({ id: 'p', weekday: 1, modalityId: 'futevolei', activityTypeId: 'personal', people: rafael })], []);
    const ledger = computeLedger(toLedger(occ, { countsHours: (o) => o.activityTypeId !== 'personal' }));
    expect(hoursOf(ledger, 'rafael')).toBeUndefined();
  });

  it('cancelamento cujo motivo paga o professor conta como hora própria', () => {
    const occ = toLedger(expandGrade(range, [version({ id: 'x', weekday: 1, modalityId: FUNCIONAL, people: rafael })], []));
    occ[0] = { ...occ[0]!, status: 'CANCELADA', cancellationCountsHours: true };
    occ[1] = { ...occ[1]!, status: 'CANCELADA', cancellationCountsHours: false };
    expect(hoursOf(computeLedger(occ), 'rafael')).toMatchObject({ ownMin: 180, cancelledMin: 60 });
  });

  it('aula avulsa é extra de quem deu', () => {
    const extra: LedgerOccurrence = {
      id: 'e', date: '2026-09-19', modalityId: HYROX, status: 'PREVISTA', plannedDurationMin: 90, durationMin: 90, countsHours: true, cancellationCountsHours: false,
      assignments: [{ plannedTeacherId: null, executingTeacherId: 'rafael', status: 'PREVISTA', minutes: 90, absenceReason: null }],
    };
    expect(hoursOf(computeLedger([extra]), 'rafael')).toMatchObject({ plannedMin: 0, extraMin: 90, totalMin: 90 });
  });

  it('separa por modalidade', () => {
    const occ = expandGrade(range, [
      version({ id: 'a', weekday: 1, modalityId: HYROX, people: rafael }),
      version({ id: 'b', weekday: 3, modalityId: FUNCIONAL, startMin: 360, people: rafael }),
    ], []);
    const r = hoursOf(computeLedger(toLedger(occ)), 'rafael')!;
    expect(r.byModality[HYROX]!.totalMin).toBe(240);
    expect(r.byModality[FUNCIONAL]!.totalMin).toBe(300);
    expect(r.totalMin).toBe(540);
  });
});

describe('invariante do cálculo (propriedade)', () => {
  it('previstas = próprias + ausências + canceladas + aguardando, para qualquer combinação', () => {
    const statuses = ['PREVISTA', 'SUBSTITUIDA', 'AUSENTE_PENDENTE', 'CANCELADA'] as const;
    let seed = 42;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    for (let run = 0; run < 300; run++) {
      const occ: LedgerOccurrence[] = Array.from({ length: 1 + rnd(20) }, (_, i) => {
        const occStatus = (['PREVISTA', 'CANCELADA', 'AGUARDANDO_DECISAO_FERIADO'] as const)[rnd(3)]!;
        const dur = [30, 45, 60, 90][rnd(4)]!;
        return {
          id: `o${i}`, date: '2026-09-01', modalityId: `m${rnd(3)}`, status: occStatus, plannedDurationMin: dur, durationMin: dur,
          countsHours: true, cancellationCountsHours: rnd(4) === 0,
          assignments: [{ plannedTeacherId: `t${rnd(3)}`, executingTeacherId: `t${rnd(4)}`, status: statuses[rnd(4)]!, minutes: dur, absenceReason: 'FALTA' as const }],
        };
      });
      for (const t of computeLedger(occ)) {
        const ownFromPlanned = t.ownMin; // sem avulsas neste teste
        expect(t.plannedMin).toBe(ownFromPlanned + t.absenceMin + t.cancelledMin + t.pendingMin);
      }
    }
  });
});
