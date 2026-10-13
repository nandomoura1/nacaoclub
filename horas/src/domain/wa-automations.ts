import { addDays, formatClock, formatDateBR, weekdayOf, WEEKDAYS, type IsoDate } from './dates';
import { isoWeek, monthName, type LeaderDemand, type PersonalShift } from './wa-jobs';

/**
 * Automações de WhatsApp (puro): quando rodam, para quem vão e como o texto é
 * montado a partir de um modelo com variáveis ({primeiro_nome}, {demandas}…).
 * O agendador roda uma vez por dia (8h de Brasília).
 */

export const FREQUENCIES = [
  { id: 'DIARIA', label: 'Todo dia' },
  { id: 'SEMANAL', label: 'Toda semana' },
  { id: 'MENSAL', label: 'Todo mês' },
] as const;
export type Frequency = (typeof FREQUENCIES)[number]['id'];

export const VARIABLES = {
  nome: 'Nome completo',
  primeiro_nome: 'Primeiro nome',
  data: 'Data de hoje (dd/mm)',
  mes: 'Mês atual (ex.: novembro de 2026)',
  link: 'Link do sistema',
  demandas: 'Lista de demandas atrasadas e da semana do líder',
  escala: 'Turnos da pessoa no fim de semana',
  grade: 'Grade semanal de aulas do professor',
} as const;
export type VariableKey = keyof typeof VARIABLES;
const BASE: VariableKey[] = ['nome', 'primeiro_nome', 'data', 'mes', 'link'];

export const AUDIENCES = [
  { id: 'LIDERES_PENDENCIAS', label: 'Líderes com demandas pendentes', detail: 'Cada líder de setor com demandas atrasadas ou vencendo em 7 dias. Quem não tem nada pendente não recebe.', vars: [...BASE, 'demandas'], filter: null },
  { id: 'LIDERES', label: 'Todos os líderes de setor', detail: 'Todos os líderes definidos em Gestão de Processos → Setores e líderes.', vars: BASE, filter: null },
  { id: 'ESCALADOS_FDS', label: 'Escalados no fim de semana', detail: 'Quem tem turno no sábado, domingo ou na segunda feriado seguinte.', vars: [...BASE, 'escala'], filter: null },
  { id: 'PROFESSORES_GRADE', label: 'Professores com aulas fixas', detail: 'Professores ativos que têm aulas na grade semanal.', vars: [...BASE, 'grade'], filter: 'modality' },
  { id: 'PROFESSORES', label: 'Todos os professores ativos', detail: 'Todos os professores ativos com WhatsApp no cadastro.', vars: BASE, filter: 'modality' },
  { id: 'PERFIL', label: 'Usuários de um perfil', detail: 'Usuários ativos de um perfil de acesso (ex.: Coordenador), com WhatsApp no cadastro.', vars: BASE, filter: 'role' },
  { id: 'NUMEROS', label: 'Números ou grupos específicos', detail: 'Lista fixa de números (um por linha) ou IDs de grupo do WhatsApp.', vars: BASE.filter((v) => v !== 'nome' && v !== 'primeiro_nome'), filter: 'numbers' },
] as const satisfies readonly { id: string; label: string; detail: string; vars: readonly VariableKey[]; filter: 'modality' | 'role' | 'numbers' | null }[];
export type Audience = (typeof AUDIENCES)[number]['id'];
export const audienceOf = (id: string) => AUDIENCES.find((a) => a.id === id);

export interface AutomationRule { frequency: string; weekdays: number[]; monthDay: number | null }

/** Roda hoje? (semana: 1 = segunda … 7 = domingo; mês: dia 1–28). */
export function isDue(a: AutomationRule, today: IsoDate): boolean {
  if (a.frequency === 'DIARIA') return true;
  if (a.frequency === 'SEMANAL') return a.weekdays.includes(weekdayOf(today));
  if (a.frequency === 'MENSAL') return Number(today.slice(8, 10)) === (a.monthDay ?? 1);
  return false;
}

/** Período para nunca enviar duas vezes: o dia, a semana (um dia por semana) ou o mês. */
export function periodOf(a: AutomationRule, today: IsoDate): string {
  if (a.frequency === 'MENSAL') return today.slice(0, 7);
  if (a.frequency === 'SEMANAL' && a.weekdays.length === 1) return isoWeek(today);
  return today;
}

export function describeWhen(a: AutomationRule): string {
  if (a.frequency === 'DIARIA') return 'Todo dia, 8h';
  if (a.frequency === 'MENSAL') return `Dia ${a.monthDay ?? 1} de cada mês, 8h`;
  const days = [...a.weekdays].sort().map((d) => WEEKDAYS[d - 1]!.long.toLowerCase());
  if (!days.length) return 'Semanal (escolha os dias)';
  return `Toda ${days.length > 1 ? `${days.slice(0, -1).join(', ')} e ${days.at(-1)}` : days[0]}, 8h`;
}

/** Troca {variavel} pelo valor; variável que não existe para o público some. Linhas vazias em excesso são compactadas. */
export function renderTemplate(template: string, vars: Partial<Record<VariableKey, string>>): string {
  return template
    .replace(/\{([a-z_]+)\}/g, (_, k: string) => (k in vars ? vars[k as VariableKey] ?? '' : ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Variáveis usadas no modelo que o público escolhido não preenche. */
export function unknownVariables(template: string, audience: string): string[] {
  const ok = new Set<string>(audienceOf(audience)?.vars ?? []);
  return [...new Set([...template.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]!))].filter((k) => !ok.has(k));
}

// ── Blocos de conteúdo ─────────────────────────────────────

const dm = (d: IsoDate) => formatDateBR(d).slice(0, 5);

export function demandsBlock(demands: LeaderDemand[]): string {
  const late = demands.filter((d) => d.late);
  const soon = demands.filter((d) => !d.late);
  const line = (d: LeaderDemand) => `• ${d.priority === 'URGENTE' ? '🔴 ' : ''}${d.title}${d.dueDate ? ` — ${d.late ? 'venceu' : 'vence'} ${dm(d.dueDate)}` : ''} _(${d.sector})_`;
  const out: string[] = [];
  if (late.length) out.push(`*Atrasadas (${late.length})*`, ...late.map(line));
  if (soon.length) out.push(...(out.length ? [''] : []), `*Vencem nesta semana (${soon.length})*`, ...soon.map(line));
  return out.join('\n');
}

export function shiftsBlock(shifts: PersonalShift[]): string {
  return [...shifts].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)
    .map((s) => `• *${WEEKDAYS[weekdayOf(s.date) - 1]!.long.toLowerCase()} ${dm(s.date)}*${s.holiday ? ` (${s.holiday})` : ''}: ${formatClock(s.startMin)}–${formatClock(s.endMin % 1440 || 1440)} · ${s.sector}`)
    .join('\n');
}

export function baseVars(name: string | null, today: IsoDate, link: string): Partial<Record<VariableKey, string>> {
  return { ...(name ? { nome: name, primeiro_nome: name.split(' ')[0]! } : {}), data: dm(today), mes: monthName(today.slice(0, 7)), link };
}

/** Exemplo de valores para a prévia do editor. */
export function sampleVars(today: IsoDate): Record<VariableKey, string> {
  const sat = addDays(today, (6 - weekdayOf(today) + 7) % 7);
  return {
    ...(baseVars('Ana Souza', today, 'https://nacao-horas.vercel.app') as Record<string, string>),
    demandas: demandsBlock([{ title: 'Inventário do freezer', sector: 'Lanchonete', dueDate: addDays(today, -3), late: true, priority: 'ALTA' }, { title: 'Cotação de açaí', sector: 'Lanchonete', dueDate: addDays(today, 3), late: false, priority: 'MEDIA' }]),
    escala: shiftsBlock([{ date: sat, startMin: 420, endMin: 1020, sector: 'Recepção' }]),
    grade: '*Segunda*\n• 07:00–08:00 CrossFit\n\n*Quarta*\n• 19:00–20:00 Funcional\n\nTotal: 2 aula(s) · 2h por semana',
  } as Record<VariableKey, string>;
}

// ── Modelos iniciais (as automações que já existiam) ───────

export const DEFAULT_TEMPLATES = {
  LIDERES: `*Bom dia, {primeiro_nome}! Suas demandas da semana* 📋

{demandas}

Atualize o andamento em: {link}

_Muitos esportes, muitas paixões, uma Nação!_ 💙`,
  ESCALA: `*Oi, {primeiro_nome}! Sua escala deste fim de semana* 🔵

{escala}

Qualquer imprevisto, avise a coordenação o quanto antes.

_Muitos esportes, muitas paixões, uma Nação!_ 💙`,
  GRADE: `*📅 Grade de {mes}*

{grade}

*Por favor, confira e responda esta mensagem:*
✅ *OK* — está tudo certo
✏️ ou descreva o que precisa ajustar (horário, aula, férias…).`,
} as const;
