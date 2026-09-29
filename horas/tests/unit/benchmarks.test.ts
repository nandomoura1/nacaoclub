import { describe, expect, it } from 'vitest';
import { CROSSFIT_BENCHMARKS, benchmarkBlock, benchmarkText, matchBenchmark } from '@/domain/benchmarks';

describe('benchmarks · biblioteca', () => {
  it('nomes únicos, movimentos preenchidos e categorias oficiais', () => {
    const names = CROSSFIT_BENCHMARKS.map((b) => b.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const b of CROSSFIT_BENCHMARKS) {
      expect(b.content.trim().length, b.name).toBeGreaterThan(3);
      expect(['GIRL', 'HERO', 'CLASSICO']).toContain(b.category);
    }
    for (const n of ['Fran', 'Grace', 'Helen', 'Cindy', 'Diane', 'Murph', 'DT']) expect(names).toContain(n.toLowerCase());
  });

  it('Fran do jeito que a box escreve', () => {
    const fran = CROSSFIT_BENCHMARKS.find((b) => b.name === 'Fran')!;
    expect(fran.format).toBe('For time: 21-15-9');
    expect(fran.content).toBe('Thrusters (kg: 43/29)\nPull-ups');
  });

  it('busca por nome, movimento e formato, sem acento e sem caixa', () => {
    const names = (q: string) => CROSSFIT_BENCHMARKS.filter((b) => matchBenchmark(b, q)).map((b) => b.name);
    expect(names('fran')).toEqual(['Fran']);
    expect(names('THRUSTER')).toEqual(expect.arrayContaining(['Fran', 'Jackie', 'Kalsu', 'Daniel']));
    expect(names('amrap')).toEqual(expect.arrayContaining(['Cindy', 'Mary', 'Nicole', 'Nate', 'McGhee']));
    expect(names('costas')).toEqual(['Griff']);
    expect(names('')).toHaveLength(CROSSFIT_BENCHMARKS.length);
  });

  it('vira bloco de WOD e texto de WhatsApp', () => {
    const murph = CROSSFIT_BENCHMARKS.find((b) => b.name === 'Murph')!;
    expect(benchmarkBlock(murph)).toMatchObject({ kind: 'WOD', title: 'Murph', format: 'For time', coachNotes: null });
    const t = benchmarkText(murph);
    expect(t.split('\n')[0]).toBe('*🏆 MURPH*');
    expect(t).toContain('• 100 pull-ups');
  });
});
