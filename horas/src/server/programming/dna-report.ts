import { parseHistory, type Session } from '@/domain/programming/history';
import { CROSSFIT_HISTORY, FUNCIONAL_HISTORY, HYROX_HISTORY } from '@/domain/programming/history.generated';
import { computeDna } from '@/domain/programming/dna';
import { blockVolume } from '@/domain/programming/calculator';
import { hyroxCoverage, modalityInsights } from '@/domain/programming/insights';
import { modalitySlug, programModality } from '@/domain/programming/modalities';
import { dayToSession } from '@/domain/programming/ai-plan';
import { WEEKDAYS, fromUtc, weekdayOf, type IsoDate } from '@/domain/dates';
import type { BlockKind, WorkoutDayData } from '@/domain/workout';
import type { TechnicalSession } from '@/domain/programming/technical';
import { prisma } from '@/server/db';
import { computeTechnicalDna, technicalInsights, type TechnicalDataset } from '@/domain/programming/technical';
import futevolei from '../../../data/historico-futevolei/futevolei.json';
import baseForte from '../../../data/historico-base-forte/base-forte.json';
import { calibrateIntensity, classify, volumeBaseline, weeklyVolumes, type IntensityClass } from '@/domain/programming/volume';

/** Histórico de cada modalidade (vem do repositório: data/historico-<slug>). */
const HISTORY: Record<string, { text: string; source: string }> = {
  crossfit: { text: CROSSFIT_HISTORY, source: 'planilhas e PDFs semanais do CrossFit (Drive), transcritos em data/historico-crossfit. Nos arquivos em que as colunas vinham misturadas, o dia da semana de cada bloco é aproximado; os totais por semana não mudam.' },
  funcional: { text: FUNCIONAL_HISTORY, source: 'documento de programação Funcional + Hyrox (ago/2024–ago/2026), segmentado em data/historico-funcional. Aulas "Funcional / Hyrox" entram nas duas modalidades; o ano de cada data foi inferido pela sequência e conferido pelo dia da semana.' },
  hyrox: { text: HYROX_HISTORY, source: 'documento de programação Funcional + Hyrox (ago/2024–ago/2026), segmentado em data/historico-hyrox (aulas rotuladas Hyrox, Corrida Fitness ou Funcional / Hyrox). Estações da prova: formato oficial HYROX.' },
};

/** Modalidades técnicas: a base são planos de aula (JSON), não WODs. */
const TECHNICAL: Record<string, { data: TechnicalDataset; source: string }> = {
  futevolei: { data: futevolei as unknown as TechnicalDataset, source: 'base de planos de aula de Futevôlei — Metodologia Nação (data/historico-futevolei/futevolei.json).' },
  'base-forte': { data: baseForte as unknown as TechnicalDataset, source: 'base de sessões Base Forte — Metodologia Nação Futevôlei (data/historico-base-forte/base-forte.json).' },
};

/** Período analisado. Sem datas = toda a base (histórico + Cadastro de Treino). */
export interface DnaRange { from?: IsoDate | null; to?: IsoDate | null }

/** Aulas lançadas no Cadastro de Treino: a base continua aprendendo com elas. */
async function launchedDays(slug: string): Promise<WorkoutDayData[]> {
  let days;
  try {
    const ids = (await prisma.modality.findMany({ select: { id: true, name: true } })).filter((m) => modalitySlug(m.name) === slug).map((m) => m.id);
    if (!ids.length) return [];
    days = await prisma.workoutDay.findMany({
      where: { week: { modalityId: { in: ids } }, blocks: { some: {} } },
      include: { blocks: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { date: 'asc' },
    });
  } catch (e) {
    // Sem banco, o DNA segue com o histórico importado (a tela e a IA não quebram).
    console.warn('[dna] aulas do Cadastro de Treino indisponíveis:', (e as Error).message);
    return [];
  }
  return days.map((d) => ({
    date: fromUtc(d.date), title: d.title,
    blocks: d.blocks.map((b) => ({ kind: b.kind as BlockKind, title: b.title, durationMin: b.durationMin, format: b.format, timeCapMin: b.timeCapMin, content: b.content, notes: b.notes, coachNotes: b.coachNotes })),
  }));
}

const inRange = (date: string | undefined, r: DnaRange) => !!date && (!r.from || date >= r.from) && (!r.to || date <= r.to);
const ranged = (r: DnaRange) => !!(r.from || r.to);
const lines = (t: string | null | undefined) => (t ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

/** Aula técnica lançada no Cadastro de Treino → formato dos planos de aula da metodologia. */
function toTechnical(d: WorkoutDayData): TechnicalSession {
  const by = (k: BlockKind) => d.blocks.find((b) => b.kind === k);
  const fund = by('FUNDAMENTO'), jogo = by('JOGO'), wu = by('AQUECIMENTO');
  const wd = WEEKDAYS[weekdayOf(d.date) - 1]!.long;
  return {
    id: d.date, date: d.date, tema: d.title || fund?.title || 'Aula', objetivo: fund?.notes ?? '',
    dia: /S[áa]bado|Domingo/.test(wd) ? wd : `${wd}-feira`,
    aquecimento: lines(wu?.content), fundamentos: [fund?.title, ...lines(fund?.format)].filter((x): x is string => !!x),
    progressao: lines(fund?.content),
    ...(jogo ? { dinamica_jogo: { descricao: [jogo.title, ...lines(jogo.content)].filter(Boolean).join('. '), regra: jogo.format ?? '' } } : {}),
    foco_coaching: lines(fund?.coachNotes).slice(0, 4),
  };
}

function buildTechnical(slug: string, launched: WorkoutDayData[], range: DnaRange) {
  const t = TECHNICAL[slug]!;
  const extra = launched.map(toTechnical);
  // Os planos da metodologia não têm data: entram só na base completa. Com período, só as aulas lançadas no período.
  const sessoes = ranged(range) ? extra.filter((s) => inRange(s.date, range)) : [...t.data.sessoes, ...extra];
  const modality = programModality(slug);
  const meta = { range, counts: { history: ranged(range) ? 0 : t.data.sessoes.length, launched: sessoes.length - (ranged(range) ? 0 : t.data.sessoes.length) } };
  if (!sessoes.length) return { modality, empty: true as const, technical: true as const, ...meta };
  const dataset = { ...t.data, sessoes };
  const dna = computeTechnicalDna(dataset);
  return { modality, empty: false as const, technical: true as const, dna, insights: technicalInsights(slug, dna), dataset, source: t.source, ...meta };
}

function build(slug: string, launched: WorkoutDayData[], range: DnaRange) {
  if (TECHNICAL[slug]) return buildTechnical(slug, launched, range);
  const modality = programModality(slug);
  const h = HISTORY[slug];
  // Histórico importado + Cadastro de Treino (a aula lançada vale mais que a do histórico na mesma data).
  const byDate = new Map<string, Session>();
  const history = parseHistory(h?.text ?? '');
  for (const x of history) byDate.set(x.date, x);
  const launchedDates = new Set<string>();
  for (const d of launched) { byDate.set(d.date, dayToSession(d)); launchedDates.add(d.date); }
  const sessions: Session[] = [...byDate.values()].filter((x) => inRange(x.date, range)).sort((a, b) => a.date.localeCompare(b.date));
  // Contagem igual à do DNA: dias especiais (eventos) ficam fora.
  const regular = sessions.filter((x) => !x.special);
  const launchedIn = regular.filter((x) => launchedDates.has(x.date)).length;
  const meta = { range, counts: { history: regular.length - launchedIn, launched: launchedIn } };
  if (!regular.length) return { modality, empty: true as const, technical: false as const, ...meta };
  const dna = computeDna(sessions);
  const base = volumeBaseline(weeklyVolumes(sessions), modality.minWeekSessions);
  const model = calibrateIntensity(sessions);
  const coverage = { exato: 0, estimado: 0, 'sem-leitura': 0 };
  const byDay = new Map<number, Record<IntensityClass, number>>();
  for (const x of sessions) for (const b of x.blocks) {
    if (b.kind !== 'WOD' || x.special) continue;
    coverage[blockVolume(b)!.kind]++;
    const c = classify(b, model);
    if (!c) continue;
    const row = byDay.get(x.weekday) ?? { LOW: 0, MODERATE: 0, HIGH: 0, 'VERY HIGH': 0 };
    row[c.cls]++;
    byDay.set(x.weekday, row);
  }
  return {
    modality, empty: false as const, technical: false as const, dna, base, model, coverage,
    byDay: [...byDay.entries()].sort((a, b) => a[0] - b[0]),
    insights: modalityInsights(slug, dna, sessions, base),
    hyrox: slug === 'hyrox' ? hyroxCoverage(sessions) : null,
    source: h?.source ?? 'aulas lançadas no Cadastro de Treino.',
    /** Aulas mais recentes (exemplos para a IA: inclui as lançadas no Cadastro). */
    recent: regular.slice(-12),
    ...meta,
  };
}

/** A base muda quando o coach lança treino: recalcula no máximo a cada 5 min. */
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: ReturnType<typeof build> }>();

/** DNA da modalidade: toda a base ou um período (histórico + Cadastro de Treino). */
export async function getDnaReport(slug: string, range: DnaRange = {}) {
  const key = `${slug}|${range.from ?? ''}|${range.to ?? ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = build(slug, await launchedDays(slug), range);
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return value;
}
export type DnaReportData = Awaited<ReturnType<typeof getDnaReport>>;

/** Lançou/alterou treino: a próxima leitura recalcula. */
export function invalidateDna(slug?: string) {
  for (const k of [...cache.keys()]) if (!slug || k.startsWith(`${slug}|`)) cache.delete(k);
}
