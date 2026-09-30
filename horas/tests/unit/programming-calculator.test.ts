import { describe, expect, it } from 'vitest';
import { parseHistory } from '@/domain/programming/history';
import { CROSSFIT_HISTORY } from '@/domain/programming/history.generated';
import { blockVolume, leadingQty, loadPair, tonnageByLevel } from '@/domain/programming/calculator';
import { LEVEL_RATIO } from '@/domain/programming/taxonomy';
import { calibrateIntensity, classify, volumeBaseline, weeklyVolumes } from '@/domain/programming/volume';

const wod = (line: string) => {
  const b = parseHistory(`## 2026-01-05\n${line}`)[0]!.blocks[0]!;
  return blockVolume(b)!;
};
const qty = (v: ReturnType<typeof wod>, id: string) => v.lines.find((l) => l.def.id === id)?.qty;

describe('calculadora de movimentos', () => {
  it('rounds for time: exemplo da seção 6', () => {
    const v = wod('WOD 12 | 5 rounds for time | 10 pull-up; 15 push-up; 20 air squat');
    expect(v.kind).toBe('exato');
    expect([qty(v, 'pull-up'), qty(v, 'push-up'), qty(v, 'air-squat')]).toEqual([50, 75, 100]);
    expect(v.totals.reps).toBe(225);
    expect(v.patterns).toMatchObject({ PULL_V: 50, PUSH_H: 75, SQUAT: 100 });
  });

  it('escada no título + tonelagem: Fran', () => {
    const v = wod('WOD 8 | "Fran" For time 21-15-9 | thruster 29/43kg; pull-up');
    expect([qty(v, 'thruster'), qty(v, 'pull-up')]).toEqual([45, 45]);
    expect(v.patterns).toMatchObject({ SQUAT: 45, PUSH_V: 45, PULL_V: 45 });
    expect(v.tonnage).toEqual({ f: 45 * 29, m: 45 * 43 });
  });

  it('item com número dentro da escada repete por degrau', () => {
    const v = wod('WOD 25 | For time 21-15-12-9-6-3 | deadlift 70/100kg; 400m run');
    expect(qty(v, 'deadlift')).toBe(66);
    expect(v.runM).toBe(2400);
  });

  it("corrida em metros e impacto: O'Connor", () => {
    const v = wod("WOD 15 | \"O'Connor\" 3 rounds for time | 15 thruster 29/43kg; 15 pull-up; 400m run");
    expect(v.runM).toBe(1200);
    expect(v.impact).toBeCloseTo(168, 0);
  });

  it('EMOM divide os minutos pelas estações', () => {
    const v = wod("WOD 25 | EMOM 25' | 10m HSW / 3 wall walk; 20 russian KB swing 16/24kg; 12/15 cal bike; 20m sled push; 20 sit-up");
    expect(qty(v, 'kb-swing')).toBe(100);
    expect(v.ergCal).toBe(68);
    expect(v.patterns.CARRY).toBe(100);
  });

  it('dupla divide o volume; sincronizado não', () => {
    const v = wod('WOD 30 | For time #partner | 100 cal row; 50 synchronized sit-up; 100 KB swing');
    expect(qty(v, 'row')).toBe(50);
    expect(qty(v, 'sit-up')).toBe(50);
    expect(qty(v, 'kb-swing')).toBe(50);
  });

  it('AMRAP é estimado pelo ritmo RX', () => {
    const v = wod('WOD 20 | "Cindy" AMRAP 20\' | 5 pull-up; 10 push-up; 15 air squat');
    expect(v.kind).toBe('estimado');
    expect(v.rounds).toBeGreaterThan(15);
    expect(v.rounds).toBeLessThan(30);
  });

  it('força: reps do esquema e volume relativo (reps × %RM)', () => {
    const v = wod('FOR 10 | Back squat | 5x5 @75%');
    expect(v.totals.reps).toBe(25);
    expect(v.relVolume).toBe(18.8);
  });

  it('lê quantidades, cargas e tempos', () => {
    expect(leadingQty('24/30 cal bike')).toMatchObject({ qty: 27, unit: 'cal' });
    expect(leadingQty('400m run')).toMatchObject({ qty: 400, unit: 'm' });
    expect(leadingQty('1:00 wall ball')).toMatchObject({ qty: 60, unit: 's', time: true });
    expect(leadingQty('15-12-9 power snatch')).toMatchObject({ qty: 36, seq: [15, 12, 9] });
    expect(loadPair('95/135lb')).toEqual({ f: 43.1, m: 61.2 });
    expect(loadPair('15/22,5kg')).toEqual({ f: 15, m: 22.5 });
  });

  it('proporção de carga por nível vem da base', () => {
    expect(LEVEL_RATIO.INTERMEDIARIO).toBeGreaterThan(0.7);
    expect(LEVEL_RATIO.INTERMEDIARIO).toBeLessThan(0.85);
    expect(LEVEL_RATIO.SCALE).toBeLessThan(LEVEL_RATIO.INTERMEDIARIO);
    expect(tonnageByLevel({ f: 1000, m: 2000 }).RX).toEqual({ f: 1000, m: 2000 });
  });
});

describe('referência da base', () => {
  const sessions = parseHistory(CROSSFIT_HISTORY);

  it('lê pelo menos 95% dos WODs do histórico', () => {
    const wods = sessions.filter((s) => !s.special).flatMap((s) => s.blocks.filter((b) => b.kind === 'WOD'));
    const read = wods.filter((b) => blockVolume(b)!.kind !== 'sem-leitura');
    expect(read.length / wods.length).toBeGreaterThan(0.95);
  });

  it('média semanal com semanas cheias', () => {
    const base = volumeBaseline(weeklyVolumes(sessions));
    expect(base.weeks).toBeGreaterThan(75);
    expect(base.metrics.squat.p75).toBeGreaterThan(base.metrics.squat.p50);
    expect(base.metrics.runM.mean).toBeGreaterThan(1000);
  });

  it('intensidade calibrada na base segue a distribuição de carga', () => {
    const model = calibrateIntensity(sessions);
    const [a, b, c] = model.thresholds;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    const fran = parseHistory('## 2026-01-05\nWOD 5 | "Fran" For time 21-15-9 | thruster 29/43kg; pull-up')[0]!.blocks[0]!;
    const long = parseHistory("## 2026-01-05\nWOD 35 | For time | 2000m run; 100 sit-up; 2000m run")[0]!.blocks[0]!;
    expect(classify(fran, model)!.index).toBeGreaterThan(classify(long, model)!.index);
  });
});
