import { z } from 'zod/v4';
import type { IsoDate } from '@/domain/dates';
import { addDays, weekdayOf } from '@/domain/dates';
import type { BlockKind, WorkoutBlockData, WorkoutDayData } from '@/domain/workout';
import type { Session, SessionBlock, SessionBlockKind } from './history';
import { blockVolume } from './calculator';
import { timeDomain, TIME_DOMAINS, type TimeDomain } from './dna';
import { detectMovements } from './movements';
import { PATTERNS, type Pattern } from './taxonomy';
import type { Stat, WeekMetric } from './volume';

/**
 * Plano de aula gerado pela IA (copiloto): o formato que o modelo devolve,
 * a conversão para os blocos do Cadastro de Treino e a conferência pelo
 * motor (tempo de aula, volume por padrão, time domain e alertas de fadiga).
 */

export const AI_BLOCK_KINDS = ['MOBILIDADE', 'AQUECIMENTO', 'SKILL', 'ESPECIFICO', 'FORCA', 'WOD', 'CORE', 'FUNDAMENTO', 'JOGO', 'OUTRO'] as const;

export const AiBlockSchema = z.object({
  tipo: z.enum(AI_BLOCK_KINDS).describe('Tipo do bloco no Cadastro de Treino.'),
  minutos: z.number().int().describe('Duração do bloco em minutos.'),
  titulo: z.string().describe('Nome do bloco: exercício principal da força, nome do WOD/benchmark, técnica. Vazio se não houver.'),
  formato: z.string().describe('Formato/esquema: "For time", "AMRAP 12\'", "EMOM 10\'", "a cada 2\' 5 sets 5-5-3-3-3 @70-80%". Vazio se não houver.'),
  timeCapMin: z.number().int().nullable().describe('Time cap do WOD em minutos, se houver.'),
  conteudo: z.array(z.string()).describe('Um movimento/linha por item, com reps e cargas F/M em kg. Ex.: "15 thruster 29/43kg".'),
  notasAluno: z.string().describe('Nota curta que vai para o aluno (estímulo, meta). Vazio se não houver.'),
  orientacoesProfessor: z.string().describe('Roteiro do professor: pacing, cues, erros comuns, organização do espaço.'),
});

export const AiPlanSchema = z.object({
  titulo: z.string().describe('Destaque curto do dia (até 40 caracteres), ex.: "Força + chipper".'),
  objetivo: z.string().describe('Objetivo do dia em 1 frase.'),
  estimulo: z.string().describe('Estímulo pretendido do WOD: time domain, intensidade, onde deve doer.'),
  blocos: z.array(AiBlockSchema),
  escalas: z.object({
    rx: z.string(),
    intermediario: z.string(),
    scale: z.string(),
    iniciante: z.string(),
  }).describe('Como cada nível faz o treino preservando o estímulo: carga, movimento e volume.'),
  decisoes: z.array(z.string()).describe('Por que cada escolha foi feita: DNA da Nação, lacunas, dias anteriores, fadiga.'),
});
export type AiPlan = z.infer<typeof AiPlanSchema>;
export type AiBlock = z.infer<typeof AiBlockSchema>;

/** Plano da IA → blocos do Cadastro de Treino. Estímulo e escalas vão no roteiro do professor do WOD. */
export function planToBlocks(plan: AiPlan): WorkoutBlockData[] {
  const wodIndex = plan.blocos.findIndex((b) => b.tipo === 'WOD');
  const e = plan.escalas;
  const extra = [
    plan.estimulo && `Estímulo: ${plan.estimulo}`,
    `Escalas — RX: ${e.rx} | Intermediário: ${e.intermediario} | Scale: ${e.scale} | Iniciante: ${e.iniciante}`,
  ].filter(Boolean).join('\n');
  return plan.blocos.map((b, i) => ({
    kind: b.tipo as BlockKind,
    title: b.titulo.trim() || null,
    durationMin: b.minutos > 0 ? b.minutos : null,
    format: b.formato.trim() || null,
    timeCapMin: b.timeCapMin && b.timeCapMin > 0 ? b.timeCapMin : null,
    content: b.conteudo.map((l) => l.trim()).filter(Boolean).join('\n') || null,
    notes: b.notasAluno.trim() || null,
    coachNotes: [b.orientacoesProfessor.trim(), i === wodIndex ? extra : ''].filter(Boolean).join('\n\n').slice(0, 1000) || null,
  }));
}

const SESSION_KIND: Partial<Record<BlockKind, SessionBlockKind>> = {
  MOBILIDADE: 'MOB', AQUECIMENTO: 'WU', SKILL: 'SKILL', ESPECIFICO: 'ESP', FORCA: 'FOR', WOD: 'WOD', CORE: 'ACC',
};

/** Bloco do Cadastro de Treino → bloco do motor (mesmo formato do histórico). */
export function toSessionBlock(b: WorkoutBlockData): SessionBlock | null {
  const kind = SESSION_KIND[b.kind];
  if (!kind) return null;
  const lines = (b.content ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const partner = /dupla|partner|trio/i.test(`${b.title ?? ''} ${b.format ?? ''}`);
  if (kind === 'FOR') {
    return { kind, minutes: b.durationMin, title: b.title ?? '', detail: [b.format, ...lines].filter(Boolean).join('; '), items: lines, tags: [] };
  }
  const title = [b.title && `"${b.title}"`, b.format].filter(Boolean).join(' ');
  return {
    kind, minutes: b.timeCapMin ?? b.durationMin, title, detail: lines.join('; '), items: lines,
    tags: partner ? [/trio/i.test(`${b.title} ${b.format}`) ? 'trio' : 'partner'] : [],
  };
}

export function dayToSession(d: WorkoutDayData): Session {
  return {
    date: d.date, weekday: weekdayOf(d.date), special: false, tags: [],
    blocks: d.blocks.map(toSessionBlock).filter((b): b is SessionBlock => !!b),
  };
}

/** Texto compacto de um dia para o contexto da IA (igual ao formato do histórico). */
export function sessionText(s: Session): string {
  const lines = [`## ${s.date}`];
  for (const b of s.blocks) lines.push(`${b.kind}${b.minutes ? ` ${b.minutes}` : ''}${b.title ? ` | ${b.title}` : ''}${b.detail ? ` | ${b.detail}` : ''}`);
  return lines.join('\n');
}

// ── Conferência pelo motor ─────────────────────────────────────────────

export interface PlanAlert { level: 'ok' | 'aviso' | 'alerta'; title: string; text: string }
export interface PlanCheck {
  totalMin: number;
  targetMin: number | null;
  wod: { minutes: number | null; domain: TimeDomain | null; domainLabel: string | null; reps: number; runM: number; ergCal: number; patterns: { id: Pattern; label: string; value: number }[]; kind: string } | null;
  alerts: PlanAlert[];
}

const HEAVY = /pesad|heavy|1rm|3rm|5rm|@\s?(8[0-9]|9[0-9]|100)\s?%|(8[0-9]|9[0-9])\s?%/i;
const FAMILY_LABEL: Record<string, string> = { squat: 'agachamento', hinge: 'levantamento terra', press: 'desenvolvimento', snatch: 'snatch', clean: 'clean', jerk: 'jerk' };

/** Famílias pesadas de força num bloco (squat, hinge, press, olímpico). */
function heavyFamilies(b: SessionBlock): string[] {
  if (b.kind !== 'FOR' || !HEAVY.test(`${b.title} ${b.detail}`)) return [];
  return [...new Set(detectMovements(`${b.title} ${b.detail}`).map((m) => m.family).filter((f) => f in FAMILY_LABEL))];
}

export function checkPlan(input: {
  plan: AiPlan;
  date: IsoDate;
  targetMin: number | null;
  recent: Session[];
  /** Volume já programado na semana do dia (sem o plano). */
  weekSoFar: Partial<Record<WeekMetric, number>>;
  baseline: Record<WeekMetric, Stat> | null;
}): PlanCheck {
  const { plan, date, targetMin, recent, weekSoFar, baseline } = input;
  const blocks = planToBlocks(plan);
  const session: Session = { date, weekday: weekdayOf(date), special: false, tags: [], blocks: blocks.map(toSessionBlock).filter((b): b is SessionBlock => !!b) };
  const totalMin = blocks.reduce((s, b) => s + (b.durationMin ?? 0), 0);
  const alerts: PlanAlert[] = [];

  if (targetMin) {
    const diff = totalMin - targetMin;
    alerts.push(diff === 0
      ? { level: 'ok', title: `Aula de ${targetMin}'`, text: `Os blocos somam ${totalMin} min.` }
      : { level: 'aviso', title: 'Tempo da aula', text: `Os blocos somam ${totalMin} min (referência ${targetMin}'; ${diff > 0 ? '+' : ''}${diff}).` });
  }

  const wodBlock = session.blocks.find((b) => b.kind === 'WOD');
  let wod: PlanCheck['wod'] = null;
  if (wodBlock) {
    const v = blockVolume(wodBlock)!;
    const minutes = wodBlock.minutes;
    const domain = minutes ? timeDomain(minutes) : null;
    wod = {
      minutes, domain, domainLabel: domain ? `${TIME_DOMAINS.find((t) => t.id === domain)!.label} (${TIME_DOMAINS.find((t) => t.id === domain)!.range})` : null,
      reps: v.totals.reps, runM: v.runM, ergCal: v.ergCal, kind: v.kind,
      patterns: PATTERNS.map((p) => ({ id: p.id, label: p.label, value: v.patterns[p.id] ?? 0 })).filter((p) => p.value > 0),
    };
    if (v.kind === 'sem-leitura') alerts.push({ level: 'aviso', title: 'WOD sem leitura', text: 'A calculadora não conseguiu ler o volume do WOD; confira as quantidades.' });

    // Time domain repetido nos dois últimos WODs.
    const lastDomains = recent.filter((s) => s.date < date).slice(-2)
      .map((s) => s.blocks.find((b) => b.kind === 'WOD')?.minutes).filter((m): m is number => !!m).map(timeDomain);
    if (domain && lastDomains.length === 2 && lastDomains.every((d) => d === domain)) {
      alerts.push({ level: 'aviso', title: 'Time domain repetido', text: `Os dois WODs anteriores também foram ${wod.domainLabel}. Varie a duração.` });
    }

    // Volume semanal projetado vs referência (F5).
    if (baseline) {
      const add: Partial<Record<WeekMetric, number>> = {
        squat: v.patterns.SQUAT ?? 0, hinge: v.patterns.HINGE ?? 0,
        push: (v.patterns.PUSH_V ?? 0) + (v.patterns.PUSH_H ?? 0), pull: (v.patterns.PULL_V ?? 0) + (v.patterns.PULL_H ?? 0),
        jump: v.patterns.JUMP ?? 0, runM: v.runM, impact: v.impact,
      };
      const LABEL: Partial<Record<WeekMetric, string>> = { squat: 'Squat', hinge: 'Hinge', push: 'Push', pull: 'Pull', jump: 'Jump', runM: 'Corrida', impact: 'Impacto' };
      for (const [k, extra] of Object.entries(add) as [WeekMetric, number][]) {
        const ref = baseline[k];
        if (!ref || !extra) continue;
        const projected = (weekSoFar[k] ?? 0) + extra;
        if (ref.p90 && projected > ref.p90) {
          alerts.push({ level: 'alerta', title: `${LABEL[k]} acima do P90`, text: `Semana ficaria com ${Math.round(projected)} (P90 da Nação: ${ref.p90}; média ${ref.mean}).` });
        } else if (ref.mean && projected > ref.mean * 1.3 && weekdayOf(date) <= 3) {
          alerts.push({ level: 'aviso', title: `${LABEL[k]} alto para o começo da semana`, text: `Até este dia a semana ficaria com ${Math.round(projected)} (média semanal ${ref.mean}).` });
        }
      }
    }
  }

  // Força pesada no mesmo padrão com menos de 48 h (F2).
  const mine = session.blocks.flatMap(heavyFamilies);
  const window = new Set([addDays(date, -1), addDays(date, -2), addDays(date, 1), addDays(date, 2)]);
  for (const s of recent.filter((r) => window.has(r.date))) {
    for (const fam of s.blocks.flatMap(heavyFamilies)) {
      if (mine.includes(fam)) alerts.push({ level: 'alerta', title: 'Força pesada sem recuperação', text: `${FAMILY_LABEL[fam]} pesado também em ${s.date.split('-').reverse().slice(0, 2).join('/')}: menos de 48 h entre as sessões.` });
    }
  }
  if (!alerts.some((a) => a.level !== 'ok')) alerts.push({ level: 'ok', title: 'Sem alertas de fadiga', text: 'Nenhum excesso de padrão, volume ou recuperação encontrado.' });
  return { totalMin, targetMin, wod, alerts };
}
