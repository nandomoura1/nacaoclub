import { parseHistory, type Session } from '@/domain/programming/history';
import { CROSSFIT_HISTORY, FUNCIONAL_HISTORY, HYROX_HISTORY } from '@/domain/programming/history.generated';
import { computeDna } from '@/domain/programming/dna';
import { blockVolume } from '@/domain/programming/calculator';
import { hyroxCoverage, modalityInsights } from '@/domain/programming/insights';
import { programModality } from '@/domain/programming/modalities';
import { calibrateIntensity, classify, volumeBaseline, weeklyVolumes, type IntensityClass } from '@/domain/programming/volume';

/** Histórico de cada modalidade (vem do repositório: data/historico-<slug>). */
const HISTORY: Record<string, { text: string; source: string }> = {
  crossfit: { text: CROSSFIT_HISTORY, source: 'planilhas e PDFs semanais do CrossFit (Drive), transcritos em data/historico-crossfit. Nos arquivos em que as colunas vinham misturadas, o dia da semana de cada bloco é aproximado; os totais por semana não mudam.' },
  funcional: { text: FUNCIONAL_HISTORY, source: 'documento de programação Funcional + Hyrox (ago/2024–ago/2026), segmentado em data/historico-funcional. Aulas "Funcional / Hyrox" entram nas duas modalidades; o ano de cada data foi inferido pela sequência e conferido pelo dia da semana.' },
  hyrox: { text: HYROX_HISTORY, source: 'documento de programação Funcional + Hyrox (ago/2024–ago/2026), segmentado em data/historico-hyrox (aulas rotuladas Hyrox, Corrida Fitness ou Funcional / Hyrox). Estações da prova: formato oficial HYROX.' },
};

function build(slug: string) {
  const modality = programModality(slug);
  const h = HISTORY[slug];
  if (!h?.text.trim()) return { modality, empty: true as const };
  const sessions: Session[] = parseHistory(h.text);
  const dna = computeDna(sessions);
  const base = volumeBaseline(weeklyVolumes(sessions), modality.minWeekSessions);
  const model = calibrateIntensity(sessions);
  const coverage = { exato: 0, estimado: 0, 'sem-leitura': 0 };
  const byDay = new Map<number, Record<IntensityClass, number>>();
  for (const s of sessions) for (const b of s.blocks) {
    if (b.kind !== 'WOD' || s.special) continue;
    coverage[blockVolume(b)!.kind]++;
    const c = classify(b, model);
    if (!c) continue;
    const row = byDay.get(s.weekday) ?? { LOW: 0, MODERATE: 0, HIGH: 0, 'VERY HIGH': 0 };
    row[c.cls]++;
    byDay.set(s.weekday, row);
  }
  return {
    modality, empty: false as const, dna, base, model, coverage,
    byDay: [...byDay.entries()].sort((a, b) => a[0] - b[0]),
    insights: modalityInsights(slug, dna, sessions, base),
    hyrox: slug === 'hyrox' ? hyroxCoverage(sessions) : null,
    source: h.source,
  };
}

const cache = new Map<string, ReturnType<typeof build>>();
/** O histórico é estático: calcula uma vez por processo. */
export function getDnaReport(slug: string) {
  let r = cache.get(slug);
  if (!r) { r = build(slug); cache.set(slug, r); }
  return r;
}
export type DnaReportData = ReturnType<typeof getDnaReport>;
