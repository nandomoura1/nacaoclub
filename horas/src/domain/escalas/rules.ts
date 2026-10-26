import { z } from 'zod';
import { WEEKDAYS } from '@/domain/dates';

/**
 * Pré-requisitos do setor. Cada tipo tem parâmetros validados aqui; o motor
 * (engine.ts) aplica e a validação (validate.ts) confere. Obrigatória = sem
 * ela a escala tem conflito; preferencial = ajusta quando possível.
 */

const weekday = z.number().int().min(1).max(7);
const uuid = z.string().uuid();
const minutes = z.number().int().min(0).max(1440);

export const RULE_KINDS = {
  FOLGA_FIXA: {
    label: 'Folga fixa',
    help: 'Ex.: Fia folga às terças e domingos.',
    schema: z.object({ memberId: uuid, weekdays: z.array(weekday).min(1).max(6) }),
  },
  TRABALHA_SEMPRE: {
    label: 'Trabalha sempre no dia',
    help: 'Ex.: Marcos trabalha todos os sábados.',
    schema: z.object({ memberId: uuid, weekdays: z.array(weekday).min(1).max(7) }),
  },
  ALTERNAR_FIM_DE_SEMANA: {
    label: 'Revezamento de fim de semana (A/B)',
    help: 'Grupo A trabalha nas semanas A e folga nas B; o grupo B, ao contrário. Ex.: Junior × Carlos aos sábados; Equipe 1 × Equipe 2 em sábado e domingo.',
    schema: z.object({
      groupA: z.array(uuid).min(1).max(10),
      groupB: z.array(uuid).min(1).max(10),
      weekdays: z.array(z.union([z.literal(6), z.literal(7)])).min(1).max(2),
      /** true = na semana em que trabalha o fim de semana fica com 6 dias e compensa na outra (média 5x2 na quinzena). */
      compensate: z.boolean().default(false),
    }),
  },
  ALTERNAR_FOLGA: {
    label: 'Alternar folgas entre duas pessoas',
    help: 'Ex.: Jess e Débora alternam as folgas de terça e quarta (semana A: Jess terça, Débora quarta; semana B: inverte).',
    schema: z.object({ memberA: uuid, memberB: uuid, weekdays: z.tuple([weekday, weekday]) }),
  },
  EVITAR_FOLGA_JUNTA: {
    label: 'Evitar folgas no mesmo dia',
    help: 'Ex.: duas colaboradoras CLT da cozinha não folgam no mesmo dia útil.',
    schema: z.object({ memberIds: z.array(uuid).min(2).max(20), weekdays: z.array(weekday).min(1).max(7) }),
  },
  COBRE_FOLGA: {
    label: 'Cobre a folga de outra pessoa',
    help: 'Ex.: Caio cobre a abertura quando Jess folga (no horário dela ou no informado).',
    schema: z.object({ coverId: uuid, coveredId: uuid, startMin: minutes.nullable().default(null), endMin: minutes.nullable().default(null) }),
  },
  MINIMO_PESSOAS: {
    label: 'Mínimo de pessoas num horário',
    help: 'Ex.: pelo menos duas pessoas das 11h às 14h, de segunda a sábado.',
    schema: z.object({ startMin: minutes, endMin: minutes, weekdays: z.array(weekday).min(1).max(7), min: z.number().int().min(1).max(50), functionName: z.string().trim().max(60).nullable().default(null) }),
  },
} as const;

export type RuleKind = keyof typeof RULE_KINDS;
export const RULE_KIND_LIST = Object.keys(RULE_KINDS) as RuleKind[];
export const isRuleKind = (k: string): k is RuleKind => Object.hasOwn(RULE_KINDS, k);

export type RuleParams<K extends RuleKind> = z.infer<(typeof RULE_KINDS)[K]['schema']>;

export function parseRule(kind: string, params: unknown): { ok: true; params: Record<string, unknown> } | { ok: false; error: string } {
  if (!isRuleKind(kind)) return { ok: false, error: 'Tipo de regra desconhecido.' };
  const r = RULE_KINDS[kind].schema.safeParse(params);
  if (!r.success) return { ok: false, error: `Regra incompleta: ${r.error.issues[0]?.path.join('.') || ''} ${r.error.issues[0]?.message ?? ''}`.trim() };
  const p = r.data as Record<string, unknown>;
  if (kind === 'MINIMO_PESSOAS' && (p.endMin as number) <= (p.startMin as number)) return { ok: false, error: 'O fim precisa ser depois do início.' };
  if (kind === 'ALTERNAR_FIM_DE_SEMANA') {
    const a = new Set(p.groupA as string[]);
    if ((p.groupB as string[]).some((x) => a.has(x))) return { ok: false, error: 'A mesma pessoa não pode estar nos dois grupos.' };
  }
  if (kind === 'ALTERNAR_FOLGA' && p.memberA === p.memberB) return { ok: false, error: 'Escolha duas pessoas diferentes.' };
  if (kind === 'COBRE_FOLGA' && p.coverId === p.coveredId) return { ok: false, error: 'Escolha duas pessoas diferentes.' };
  return { ok: true, params: p };
}

const day = (n: number) => WEEKDAYS[n - 1]!.long.toLowerCase();
export const daysLabel = (ns: number[]) => ns.length ? [...ns].sort().map(day).join(', ') : '—';

/** Descrição automática (quando a regra não tem rótulo). */
export function describeRule(kind: string, p: Record<string, unknown>, name: (id: string) => string): string {
  const names = (ids: unknown) => (ids as string[]).map(name).join(' + ');
  const hh = (m: unknown) => `${String(Math.floor((m as number) / 60)).padStart(2, '0')}:${String((m as number) % 60).padStart(2, '0')}`;
  switch (kind) {
    case 'FOLGA_FIXA': return `${name(p.memberId as string)} folga: ${daysLabel(p.weekdays as number[])}`;
    case 'TRABALHA_SEMPRE': return `${name(p.memberId as string)} trabalha sempre: ${daysLabel(p.weekdays as number[])}`;
    case 'ALTERNAR_FIM_DE_SEMANA': return `${names(p.groupA)} × ${names(p.groupB)} alternam ${daysLabel(p.weekdays as number[])}${p.compensate ? ' (compensa na quinzena)' : ''}`;
    case 'ALTERNAR_FOLGA': return `${name(p.memberA as string)} e ${name(p.memberB as string)} alternam as folgas de ${daysLabel(p.weekdays as number[])}`;
    case 'EVITAR_FOLGA_JUNTA': return `Evitar folga no mesmo dia (${daysLabel(p.weekdays as number[])}): ${names(p.memberIds)}`;
    case 'COBRE_FOLGA': return `${name(p.coverId as string)} cobre quando ${name(p.coveredId as string)} folga${p.startMin != null && p.endMin != null ? ` (${hh(p.startMin)}–${hh(p.endMin)})` : ''}`;
    case 'MINIMO_PESSOAS': return `Mínimo de ${p.min as number} pessoa(s)${p.functionName ? ` (${p.functionName as string})` : ''} das ${hh(p.startMin)} às ${hh(p.endMin)}: ${daysLabel(p.weekdays as number[])}`;
    default: return kind;
  }
}
