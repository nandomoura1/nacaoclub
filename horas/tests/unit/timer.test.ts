import { describe, expect, it } from 'vitest';
import { applyTimer, describeTimer, elapsedOf, normalizeTimer, sequenceErrors, suggestTimer, timerFrame, timerTotalSec } from '@/domain/timer';

const s = (sec: number, lead = 10) => (lead + sec) * 1000;

describe('cronômetro de aula', () => {
  it('AMRAP: contagem inicial, regressiva arredondando para cima e time cap', () => {
    const c = normalizeTimer({ kind: 'AMRAP', durationSec: 720 });
    expect(timerFrame(c, null)).toMatchObject({ phase: 'READY', clock: '12:00' });
    expect(timerFrame(c, 0)).toMatchObject({ phase: 'LEAD', clock: '10' });
    expect(timerFrame(c, 9_500)).toMatchObject({ phase: 'LEAD', clock: '1' });
    expect(timerFrame(c, s(0))).toMatchObject({ phase: 'WORK', clock: '12:00' });
    expect(timerFrame(c, s(0.2))).toMatchObject({ clock: '12:00' });
    expect(timerFrame(c, s(1))).toMatchObject({ clock: '11:59' });
    expect(timerFrame(c, s(719.5))).toMatchObject({ clock: '00:01' });
    expect(timerFrame(c, s(720))).toMatchObject({ phase: 'DONE', caption: 'TIME CAP' });
  });
  it('For Time: conta para cima; sem cap não termina', () => {
    const c = normalizeTimer({ kind: 'FOR_TIME', durationSec: 900, leadInSec: 0 });
    expect(timerFrame(c, 65_400)).toMatchObject({ phase: 'WORK', clock: '01:05' });
    expect(timerFrame(c, 900_000)).toMatchObject({ phase: 'DONE', clock: '15:00', caption: 'TIME CAP' });
    const free = normalizeTimer({ kind: 'FOR_TIME', durationSec: 0, leadInSec: 0 });
    expect(timerTotalSec(free)).toBeNull();
    expect(timerFrame(free, 4_000_000)).toMatchObject({ phase: 'WORK', clock: '1:06:40' });
  });
  it('EMOM e Tabata: rounds, trabalho e descanso', () => {
    const e = normalizeTimer({ kind: 'EMOM', workSec: 60, rounds: 10, leadInSec: 0 });
    expect(timerFrame(e, 61_000)).toMatchObject({ round: 2, clock: '00:59', caption: 'Round 2 de 10' });
    expect(timerFrame(e, 600_000).phase).toBe('DONE');
    const t = normalizeTimer({ kind: 'INTERVAL', workSec: 20, restSec: 10, rounds: 8, leadInSec: 0, label: 'Tabata' });
    expect(timerTotalSec(t)).toBe(230);
    expect(timerFrame(t, 5_000)).toMatchObject({ phase: 'WORK', round: 1, clock: '00:15' });
    expect(timerFrame(t, 22_000)).toMatchObject({ phase: 'REST', round: 1, clock: '00:08' });
    expect(timerFrame(t, 30_000)).toMatchObject({ phase: 'WORK', round: 2, clock: '00:20' });
    expect(timerFrame(t, 229_000)).toMatchObject({ phase: 'WORK', round: 8 });
    expect(timerFrame(t, 230_000)).toMatchObject({ phase: 'DONE', caption: 'Fim!' });
    expect(describeTimer(t)).toBe('Tabata 8 × 00:20/00:10');
  });
  it('comandos: iniciar, pausar, retomar e zerar', () => {
    let st = applyTimer(null, { type: 'program', config: normalizeTimer({ kind: 'AMRAP', durationSec: 600 }) }, 0)!;
    expect(elapsedOf(st, 5000)).toBeNull();
    st = applyTimer(st, { type: 'start' }, 1000)!;
    st = applyTimer(st, { type: 'pause' }, 21_000)!;
    expect(elapsedOf(st, 99_000)).toBe(20_000);
    st = applyTimer(st, { type: 'resume' }, 31_000)!;
    expect(elapsedOf(st, 41_000)).toBe(30_000);
    expect(applyTimer(st, { type: 'reset' }, 50_000)).toMatchObject({ startedAt: null, pausedMs: 0 });
    expect(applyTimer(st, { type: 'full', on: true }, 0)!.full).toBe(true);
    expect(applyTimer(st, { type: 'clear' }, 0)).toBeNull();
    expect(applyTimer(null, { type: 'start' }, 0)).toBeNull();
  });
  it('sugere o timer pelo bloco do treino', () => {
    const b = (format: string, extra: object = {}) => ({ kind: 'WOD', title: null, format, timeCapMin: null, durationMin: null, ...extra });
    expect(suggestTimer(b('AMRAP 12'))).toMatchObject({ kind: 'AMRAP', durationSec: 720 });
    expect(suggestTimer(b('EMOM 10'))).toMatchObject({ kind: 'EMOM', workSec: 60, rounds: 10 });
    expect(suggestTimer(b('E2MOM 16'))).toMatchObject({ kind: 'EMOM', workSec: 120, rounds: 8 });
    expect(suggestTimer(b('For time', { timeCapMin: 15 }))).toMatchObject({ kind: 'FOR_TIME', durationSec: 900 });
    expect(suggestTimer(b('Tabata'))).toMatchObject({ kind: 'INTERVAL', workSec: 20, restSec: 10, rounds: 8 });
    expect(suggestTimer(b('3 séries de 10'))).toBeNull();
  });
});

describe('sequência de timers', () => {
  const seq = normalizeTimer({ kind: 'SEQUENCE', label: 'Treino', leadInSec: 10, parts: [
    { kind: 'EMOM', workSec: 60, rounds: 10, label: 'EMOM', leadInSec: 10 } as never,
    { kind: 'COUNTDOWN', durationSec: 120, label: 'Descanso' } as never,
    { kind: 'FOR_TIME', durationSec: 900, label: 'For Time' } as never,
  ] });
  it('EMOM 10 → descanso 2 → For Time 15, uma contagem só no começo', () => {
    expect(seq.parts!.map((p) => p.leadInSec)).toEqual([0, 0, 0]);
    expect(timerTotalSec(seq)).toBe(600 + 120 + 900);
    expect(describeTimer(seq)).toBe('EMOM 10 × 01:00 → Descanso 02:00 → For Time · cap 15:00');
    expect(sequenceErrors(seq)).toEqual([]);
    expect(timerFrame(seq, null)).toMatchObject({ phase: 'READY', part: 1, parts: 3 });
    expect(timerFrame(seq, 3_000)).toMatchObject({ phase: 'LEAD', part: 1 });
    expect(timerFrame(seq, s(61))).toMatchObject({ phase: 'WORK', part: 1, round: 2, clock: '00:59', next: 'Descanso 02:00' });
    expect(timerFrame(seq, s(600))).toMatchObject({ phase: 'REST', part: 2, clock: '02:00', next: 'For Time · cap 15:00' });
    expect(timerFrame(seq, s(719.5))).toMatchObject({ phase: 'REST', part: 2, clock: '00:01' });
    expect(timerFrame(seq, s(720))).toMatchObject({ phase: 'WORK', part: 3, clock: '00:00', next: null });
    expect(timerFrame(seq, s(720 + 125))).toMatchObject({ part: 3, clock: '02:05' });
    expect(timerFrame(seq, s(1620))).toMatchObject({ phase: 'DONE', caption: 'TIME CAP' });
  });
  it('For Time sem cap só no fim; "próxima parte" pula o restante', () => {
    const bad = normalizeTimer({ kind: 'SEQUENCE', parts: [{ kind: 'FOR_TIME', durationSec: 0 } as never, { kind: 'COUNTDOWN', durationSec: 60 } as never] });
    expect(sequenceErrors(bad)[0]).toMatch(/Parte 1/);
    expect(sequenceErrors(normalizeTimer({ kind: 'SEQUENCE', parts: [{ kind: 'AMRAP', durationSec: 60 } as never] }))[0]).toMatch(/2 partes/);
    let st = applyTimer(null, { type: 'program', config: seq }, 0)!;
    st = applyTimer(st, { type: 'start' }, 0)!;
    st = applyTimer(st, { type: 'next' }, 5_000)!; // na contagem → começa a parte 1
    expect(timerFrame(seq, elapsedOf(st, 5_000))).toMatchObject({ part: 1, clock: '01:00', round: 1 });
    st = applyTimer(st, { type: 'next' }, 30_000)!; // no EMOM → vai para o descanso
    expect(timerFrame(seq, elapsedOf(st, 30_000))).toMatchObject({ part: 2, clock: '02:00' });
    st = applyTimer(st, { type: 'pause' }, 40_000)!;
    st = applyTimer(st, { type: 'next' }, 50_000)!; // pausado também funciona
    expect(timerFrame(seq, elapsedOf(st, 99_000))).toMatchObject({ part: 3, clock: '00:00' });
    expect(applyTimer(st, { type: 'next' }, 60_000)).toBe(st); // última parte: nada a pular
  });
});
