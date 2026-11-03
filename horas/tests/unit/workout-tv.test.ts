import { describe, expect, it } from 'vitest';
import { screenDate, tvLayout } from '@/domain/workout-tv';
import type { WorkoutBlockData } from '@/domain/workout';

const b = (kind: WorkoutBlockData['kind'], extra: Partial<WorkoutBlockData> = {}): WorkoutBlockData => ({ kind, title: null, durationMin: 10, format: null, timeCapMin: null, content: null, notes: null, coachNotes: 'só professor', ...extra });

describe('Treino na TV', () => {
  it('fases rápidas na faixa; força/WOD em colunas, sem orientação ao professor', () => {
    const l = tvLayout([
      b('MOBILIDADE', { durationMin: 5, content: 'não aparece' }), b('AQUECIMENTO'),
      b('FORCA', { title: 'Back squat', format: '5x5', content: '5x5 @75%' }),
      b('WOD', { title: "O'Connor", format: 'For time', timeCapMin: 15, content: '21-15-9\nThrusters\nPull-ups' }),
    ]);
    expect(l.quick).toEqual([{ label: 'Mobilidade', minutes: 5, title: null }, { label: 'Warm-up', minutes: 10, title: null }]);
    expect(l.columns.map((c) => c.blocks.map((x) => x.kind))).toEqual([['FORCA'], ['WOD']]);
    expect(l.columns.flatMap((c) => c.blocks).every((x) => x.coachNotes === null)).toBe(true);
    expect(l.totalMinutes).toBe(35);
    expect(l.fontVh).toBeGreaterThan(3); // pouco texto: letra grande
  });
  it('muito texto: no máximo 3 colunas, ordem mantida e letra menor (sem cortar)', () => {
    const big = Array.from({ length: 5 }, (_, i) => b('WOD', { title: `Parte ${i + 1}`, content: Array.from({ length: 12 }, (_, j) => `${10 + j} movimento longo com descrição ${j}`).join('\n') }));
    const l = tvLayout(big);
    expect(l.columns.length).toBe(3);
    expect(l.columns.flatMap((c) => c.blocks.map((x) => x.title))).toEqual(['Parte 1', 'Parte 2', 'Parte 3', 'Parte 4', 'Parte 5']);
    expect(l.fontVh).toBeLessThan(2.6);
    expect(tvLayout([]).columns).toEqual([]);
  });
  it('dia da tela: fixado enquanto não passou, senão hoje', () => {
    expect(screenDate(null, '2026-10-21')).toEqual({ date: '2026-10-21', pinned: false });
    expect(screenDate('2026-10-22', '2026-10-21')).toEqual({ date: '2026-10-22', pinned: true });
    expect(screenDate('2026-10-20', '2026-10-21')).toEqual({ date: '2026-10-21', pinned: false });
  });
});

describe('treino ao lado do cronômetro', () => {
  it('uma coluna só, com letra menor que na tela inteira', () => {
    const blocks = [
      { kind: 'AQUECIMENTO', title: null, durationMin: 10, format: null, timeCapMin: null, content: '2 rounds', notes: null },
      { kind: 'FORCA', title: 'Back squat', durationMin: 15, format: '5x3', timeCapMin: null, content: 'Back squat 5x3 @ 80%\nDescanso 2 min', notes: null },
      { kind: 'WOD', title: 'Fran', durationMin: 12, format: 'For time', timeCapMin: 12, content: '21-15-9\nThrusters\nPull-ups', notes: null },
    ] as never;
    const full = tvLayout(blocks);
    const side = tvLayout(blocks, { widthVh: 92, bodyVh: 70, maxColumns: 1 });
    expect(full.columns).toHaveLength(2);
    expect(side.columns).toHaveLength(1);
    expect(side.columns[0]!.blocks.map((b) => b.kind)).toEqual(['FORCA', 'WOD']);
    expect(side.quick.map((q) => q.label)).toEqual(['Warm-up']);
    expect(side.fontVh).toBeLessThanOrEqual(full.fontVh + 0.5);
  });
});
