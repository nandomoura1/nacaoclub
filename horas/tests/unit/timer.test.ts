import { describe, expect, it } from 'vitest';
import { applyTimer, describeTimer, elapsedOf, normalizeTimer, suggestTimer, timerFrame, timerTotalSec } from '@/domain/timer';

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
