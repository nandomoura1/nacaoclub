/**
 * Modalidades com programação própria no módulo de Treinos. Cada uma tem seu
 * DNA (aprendido do histórico dela), seus benchmarks e, depois, sua geração
 * de treino por IA. Arquivo leve: o menu (cliente) importa daqui.
 */
export interface ProgramModality {
  slug: string;
  name: string;
  /** Tem biblioteca de benchmarks. */
  benchmarks: boolean;
  /** Aulas por semana que contam como "semana cheia" na referência de volume. */
  minWeekSessions: number;
}

export const PROGRAM_MODALITIES: ProgramModality[] = [
  { slug: 'crossfit', name: 'CrossFit', benchmarks: true, minWeekSessions: 5 },
  { slug: 'funcional', name: 'Funcional', benchmarks: true, minWeekSessions: 5 },
  { slug: 'hyrox', name: 'Hyrox', benchmarks: true, minWeekSessions: 2 },
  { slug: 'futevolei', name: 'Futevôlei', benchmarks: true, minWeekSessions: 3 },
  { slug: 'base-forte', name: 'Base Forte', benchmarks: false, minWeekSessions: 3 },
];

/** "Futevôlei" → "futevolei", "Base Forte" → "base-forte". */
export function modalitySlug(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function programModality(slug: string): ProgramModality {
  const m = PROGRAM_MODALITIES.find((x) => x.slug === slug);
  if (!m) throw new Error(`Modalidade sem programação: ${slug}`);
  return m;
}

/** Modalidades técnicas: aula de fundamento → progressão → jogo, sem WOD nem carga. */
export const isTechnicalSlug = (slug: string) => slug === 'futevolei' || slug === 'base-forte';

/** Rótulos dos quatro níveis do plano da IA (escalas.rx … escalas.iniciante) por modalidade. */
export function levelLabels(slug: string): [key: 'rx' | 'intermediario' | 'scale' | 'iniciante', label: string][] {
  return isTechnicalSlug(slug)
    ? [['rx', 'Avançado'], ['intermediario', 'Intermediário'], ['scale', 'Aprendiz (D/C)'], ['iniciante', 'Primeira aula']]
    : [['rx', 'RX'], ['intermediario', 'Intermediário'], ['scale', 'Scale'], ['iniciante', 'Iniciante']];
}
