import { z } from 'zod';
import { z as z4 } from 'zod/v4';
import { addDays, isIsoDate, weekdayOf, type IsoDate } from '@/domain/dates';

/**
 * Planilha gerada pela IA: um período de N dias ou semanas (curto, médio ou
 * longo prazo). Primeiro a IA desenha a estratégia (fases, semanas e o tema
 * de cada dia); depois gera as aulas dia a dia, com a estratégia no contexto.
 */

export const PROGRAM_KINDS = [
  { id: 'periodizacao', label: 'Periodização nova', help: 'Objetivo definido (ex.: força, condicionamento, preparar um benchmark ou prova), com fases, progressão, deload e teste.' },
  { id: 'continuidade', label: 'Continuidade da programação', help: 'Segue a programação dos últimos 14 ou 30 dias, mantendo o DNA e equilibrando o que ficou para trás.' },
] as const;

export const programRequestSchema = z.object({
  kind: z.enum(['periodizacao', 'continuidade']),
  title: z.string().trim().max(80).optional().default(''),
  startDate: z.string().refine(isIsoDate, 'Data de início inválida.'),
  length: z.coerce.number().int().min(1, 'Informe a duração.').max(84, 'Máximo de 12 semanas (84 dias).'),
  unit: z.enum(['dias', 'semanas']),
  /** Dias da semana com aula (1 = segunda … 6 = sábado). */
  weekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1, 'Escolha ao menos um dia da semana.'),
  goal: z.string().trim().max(600).optional().default(''),
  capacity: z.enum(['geral', 'forca', 'lpo', 'ginastica', 'engine', 'benchmark', 'competicao']).default('geral'),
  movement: z.string().trim().max(80).optional().default(''),
  test: z.enum(['nenhum', '1RM', '3RM', '5RM', 'benchmark', 'max reps']).default('nenhum'),
  level: z.enum(['geral', 'intermediario', 'avancado', 'competicao']).default('geral'),
  window: z.coerce.number().refine((n) => n === 14 || n === 30, 'Janela inválida.').default(14),
}).refine((r) => (r.unit === 'semanas' ? r.length * 7 : r.length) <= 84, { message: 'Máximo de 12 semanas (84 dias).', path: ['length'] });
export type ProgramRequest = z.output<typeof programRequestSchema>;

export const CAPACITY_LABEL: Record<ProgramRequest['capacity'], string> = {
  geral: 'Condicionamento geral (sem capacidade específica)', forca: 'Força', lpo: 'Levantamento olímpico', ginastica: 'Ginástica / skill',
  engine: 'Engine / condicionamento', benchmark: 'Preparar um benchmark', competicao: 'Preparação para competição',
};
export const LEVEL_LABEL: Record<ProgramRequest['level'], string> = {
  geral: 'Turmas gerais', intermediario: 'Intermediário', avancado: 'Avançado', competicao: 'Competição',
};

/** Dias do período em que há aula. */
export function trainingDates(req: Pick<ProgramRequest, 'startDate' | 'length' | 'unit' | 'weekdays'>): IsoDate[] {
  const total = req.unit === 'semanas' ? req.length * 7 : req.length;
  const days = new Set(req.weekdays);
  const out: IsoDate[] = [];
  for (let i = 0; i < total; i++) {
    const d = addDays(req.startDate, i);
    if (days.has(weekdayOf(d))) out.push(d);
  }
  return out;
}

/** Curto (até 2 semanas), médio (3–6) ou longo prazo (7+). */
export function horizon(req: Pick<ProgramRequest, 'length' | 'unit'>): 'curto' | 'medio' | 'longo' {
  const weeks = req.unit === 'semanas' ? req.length : req.length / 7;
  return weeks <= 2 ? 'curto' : weeks <= 6 ? 'medio' : 'longo';
}
export const HORIZON_LABEL = { curto: 'Curto prazo', medio: 'Médio prazo', longo: 'Longo prazo' } as const;

// ── Estratégia (saída estruturada da IA) ───────────────────────────────

export const ProgramDaySchema = z4.object({
  data: z4.string().describe('Data da aula, AAAA-MM-DD (uma das datas pedidas).'),
  tema: z4.string().describe('Tema curto do dia, ex.: "Força squat + WOD longo em dupla".'),
  forca: z4.string().describe('Bloco de força/skill do dia com esquema e % (ou vazio se não houver).'),
  wod: z4.string().describe('Estímulo do WOD: time domain, formato e modalidades (sem escrever o treino inteiro).'),
  intensidade: z4.enum(['LOW', 'MODERATE', 'HIGH', 'VERY HIGH']),
});
export const ProgramWeekSchema = z4.object({
  semana: z4.number().int(),
  fase: z4.string(),
  foco: z4.string(),
  volume: z4.enum(['baixo', 'moderado', 'alto']),
  intensidade: z4.enum(['baixa', 'moderada', 'alta', 'muito alta']),
  deload: z4.boolean(),
  dias: z4.array(ProgramDaySchema),
});
export const ProgramPlanSchema = z4.object({
  titulo: z4.string().describe('Nome curto da planilha.'),
  modelo: z4.string().describe('Modelo de periodização escolhido (linear, ondulatória, blocos, step loading, continuidade…).'),
  estrategia: z4.string().describe('A estratégia em 3–5 frases: por que este modelo, como progride, como protege a aula geral da modalidade.'),
  objetivoFinal: z4.string(),
  fases: z4.array(z4.object({ nome: z4.string(), semanas: z4.string().describe('Ex.: "1–3"'), objetivo: z4.string() })),
  semanas: z4.array(ProgramWeekSchema),
  testes: z4.array(z4.string()).describe('Testes e marcos (ex.: "3RM back squat na semana 8").'),
  decisoes: z4.array(z4.string()).describe('Por que cada decisão: DNA da Nação, lacunas, últimos dias, fadiga.'),
});
export type ProgramPlan = z4.infer<typeof ProgramPlanSchema>;
export type ProgramDay = z4.infer<typeof ProgramDaySchema>;

/** Dias da estratégia só nas datas pedidas, sem repetir. */
export function normalizePlan(plan: ProgramPlan, dates: IsoDate[]): ProgramPlan {
  const valid = new Set(dates);
  const seen = new Set<string>();
  return {
    ...plan,
    semanas: plan.semanas.map((w) => ({
      ...w,
      dias: w.dias.filter((d) => valid.has(d.data) && !seen.has(d.data) && seen.add(d.data)).sort((a, b) => a.data.localeCompare(b.data)),
    })).filter((w) => w.dias.length),
  };
}

/** Tema do dia na estratégia. */
export function dayInPlan(plan: ProgramPlan, date: IsoDate): { week: ProgramPlan['semanas'][number]; day: ProgramDay } | null {
  for (const week of plan.semanas) {
    const day = week.dias.find((d) => d.data === date);
    if (day) return { week, day };
  }
  return null;
}
