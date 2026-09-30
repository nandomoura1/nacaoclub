import { describe, expect, it } from 'vitest';
import { parseHistory } from '@/domain/programming/history';
import { FUNCIONAL_HISTORY, HYROX_HISTORY } from '@/domain/programming/history.generated';
import { computeDna } from '@/domain/programming/dna';
import { hyroxCoverage, modalityInsights } from '@/domain/programming/insights';
import { PROGRAM_MODALITIES, modalitySlug, programModality } from '@/domain/programming/modalities';
import { volumeBaseline, weeklyVolumes } from '@/domain/programming/volume';
import { NAV_TREINOS } from '@/components/shell/nav';

describe('modalidades da programação', () => {
  it('slug a partir do nome da modalidade cadastrada', () => {
    expect(modalitySlug('CrossFit')).toBe('crossfit');
    expect(modalitySlug('Futevôlei')).toBe('futevolei');
    expect(modalitySlug('Base Forte')).toBe('base-forte');
    expect(programModality('hyrox').minWeekSessions).toBe(2);
  });

  it('menu de Treinos: cadastro + um grupo por modalidade (Base Forte sem benchmarks)', () => {
    expect(NAV_TREINOS[0]!.href).toBe('/treinos');
    const groups = [...new Set(NAV_TREINOS.map((i) => i.group).filter(Boolean))];
    expect(groups).toEqual(PROGRAM_MODALITIES.map((m) => m.name));
    expect(NAV_TREINOS.filter((i) => i.group === 'Base Forte').map((i) => i.label)).toEqual(['DNA da Programação', 'Geração de Treino IA']);
    expect(NAV_TREINOS.filter((i) => i.group === 'Hyrox').map((i) => i.href)).toEqual(['/treinos/hyrox/benchmarks', '/treinos/hyrox/dna', '/treinos/hyrox/ia']);
  });
});

describe('histórico segmentado Funcional / Hyrox', () => {
  const funcional = parseHistory(FUNCIONAL_HISTORY);
  const hyrox = parseHistory(HYROX_HISTORY);

  it('as duas bases têm volume para aprender', () => {
    expect(funcional.length).toBeGreaterThan(500);
    expect(hyrox.length).toBeGreaterThan(100);
    // Hyrox acontece segunda, quarta e sábado; nunca no domingo.
    expect(new Set(hyrox.map((s) => s.weekday))).not.toContain(7);
  });

  it('aula mista entra nas duas modalidades', () => {
    const mixed = hyrox.filter((s) => s.tags.includes('misto')).map((s) => s.date);
    expect(mixed.length).toBeGreaterThan(0);
    expect(funcional.some((s) => s.date === mixed[0])).toBe(true);
  });

  it('diagnóstico próprio de cada modalidade', () => {
    for (const [slug, sessions] of [['funcional', funcional], ['hyrox', hyrox]] as const) {
      const base = volumeBaseline(weeklyVolumes(sessions), programModality(slug).minWeekSessions);
      const ins = modalityInsights(slug, computeDna(sessions), sessions, base);
      expect(ins.filter((i) => i.tone === 'assinatura').length).toBeGreaterThanOrEqual(3);
      expect(ins.some((i) => i.tone === 'lacuna')).toBe(true);
      expect(ins.every((i) => !/\d\.\d/.test(i.text))).toBe(true); // decimais com vírgula
    }
  });

  it('Hyrox: cobertura das 8 estações + corrida', () => {
    const cov = hyroxCoverage(hyrox);
    expect(cov).toHaveLength(9);
    expect(cov.find((c) => c.id === 'run')!.share).toBeGreaterThan(70);
  });
});
