import { describe, expect, it } from 'vitest';
import { computeLedger, isDoubleDay, type LedgerOccurrence } from '@/domain/ledger';

/** Domingo e feriado valem o dobro para quem trabalhou (professor ou estagiário). */
const occ = (p: Partial<LedgerOccurrence> & { date: string; assignments: LedgerOccurrence['assignments'] }): LedgerOccurrence => ({
  id: p.date, modalityId: 'm', status: 'PREVISTA', plannedDurationMin: 360, durationMin: 360, countsHours: true, cancellationCountsHours: false, ...p,
});
const own = (t: string, min = 360) => ({ plannedTeacherId: t, executingTeacherId: t, status: 'PREVISTA' as const, minutes: min, absenceReason: null });

describe('domingo e feriado valem o dobro', () => {
  it('quais dias: domingo e feriado cadastrado, a partir da data em que a regra vale', () => {
    const feriados = new Set(['2026-10-12']);
    expect(isDoubleDay('2026-10-04', feriados, null)).toBe(true);  // domingo
    expect(isDoubleDay('2026-10-12', feriados, null)).toBe(true);  // feriado (segunda)
    expect(isDoubleDay('2026-10-03', feriados, null)).toBe(false); // sábado
    expect(isDoubleDay('2026-09-20', feriados, '2026-09-26')).toBe(false); // domingo antes da regra
  });

  it('8h–14h no domingo = 12h; vale para titular, substituto e avulsa (escala); cancelada que paga não ganha adicional', () => {
    const ledger = computeLedger([
      occ({ date: '2026-10-04', doubled: true, assignments: [own('ana'), { ...own('est'), plannedTeacherId: 'est' }] }), // titular + estagiário
      occ({ date: '2026-10-12', doubled: true, plannedDurationMin: 60, durationMin: 60, assignments: [{ plannedTeacherId: 'bia', executingTeacherId: 'cris', status: 'SUBSTITUIDA', minutes: 60, absenceReason: 'FERIAS' }] }),
      occ({ date: '2026-10-04', doubled: true, plannedDurationMin: 120, durationMin: 120, assignments: [{ plannedTeacherId: null, executingTeacherId: 'dani', status: 'PREVISTA', minutes: 120, absenceReason: null }] }),
      occ({ date: '2026-10-11', doubled: true, status: 'CANCELADA', cancellationCountsHours: true, plannedDurationMin: 60, assignments: [{ ...own('eva', 60), status: 'CANCELADA' }] }),
      occ({ date: '2026-10-03', doubled: false, assignments: [own('ana', 60)] }), // sábado: normal
    ]);
    const h = (id: string) => ledger.find((t) => t.teacherId === id)!;
    expect(h('ana')).toMatchObject({ ownMin: 420, bonusMin: 360, totalMin: 780 }); // 6h dom. ×2 + 1h sáb.
    expect(h('est')).toMatchObject({ ownMin: 360, bonusMin: 360, totalMin: 720 });
    expect(h('cris')).toMatchObject({ substitutionMin: 60, bonusMin: 60, totalMin: 120 });
    expect(h('bia')).toMatchObject({ absenceMin: 60, bonusMin: 0, totalMin: 0 }); // não trabalhou: sem adicional
    expect(h('dani')).toMatchObject({ extraMin: 120, bonusMin: 120, totalMin: 240 });
    expect(h('eva')).toMatchObject({ ownMin: 60, bonusMin: 0, totalMin: 60 });
    expect(h('ana').byModality.m).toMatchObject({ bonusMin: 360 });
  });
});

import { personalWhatsapp } from '@/domain/personal';
describe('treino Personal no WhatsApp', () => {
  it('título, aluno e dia; blocos vazios ficam de fora', () => {
    const t = personalWhatsapp({ title: 'Pernas + core', student: 'Joana', date: '2026-10-05', goal: '', blocks: [
      { kind: 'FORCA', title: '', durationMin: 20, format: '4 x 10', content: 'Agachamento goblet', notes: '' },
      { kind: 'CORE', title: '', durationMin: null, format: '', content: '', notes: '' },
    ] });
    expect(t).toBe('*Pernas + core*\nJoana · Segunda, 05/10/2026\n\n*Força · 20\'*\n4 x 10\nAgachamento goblet');
  });
});
