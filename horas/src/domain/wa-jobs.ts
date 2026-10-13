import { addDays, formatClock, formatDateBR, weekdayOf, WEEKDAYS, type IsoDate } from './dates';

/**
 * Envios automáticos de WhatsApp (puro): quando cada um roda, a chave do
 * período (para nunca mandar duas vezes) e os textos.
 * O agendador roda uma vez por dia (8h de Brasília) e decide o que é do dia.
 */

export const WA_JOBS = [
  { key: 'LIDERES', label: 'Lembrete semanal aos líderes', when: 'Toda segunda-feira, 8h', detail: 'Cada líder recebe as demandas atrasadas e as que vencem na semana (Gestão de Processos). Quem não tem nada pendente não recebe.' },
  { key: 'ESCALA_FDS', label: 'Escala do fim de semana', when: 'Toda sexta-feira, 8h', detail: 'Cada professor escalado recebe os próprios turnos de sábado, domingo e feriado da segunda.' },
  { key: 'GRADE_MENSAL', label: 'Grade mensal para confirmação', when: 'Dia 1 de cada mês, 8h', detail: 'Cada professor ativo com aulas fixas recebe a própria grade do mês e responde confirmando.' },
] as const;
export type WaJobKey = (typeof WA_JOBS)[number]['key'];
export const isJobKey = (k: string): k is WaJobKey => WA_JOBS.some((j) => j.key === k);

/** Quais envios são de hoje. */
export function dueJobs(today: IsoDate): WaJobKey[] {
  const wd = weekdayOf(today); // 1 = segunda … 7 = domingo
  const out: WaJobKey[] = [];
  if (wd === 1) out.push('LIDERES');
  if (wd === 5) out.push('ESCALA_FDS');
  if (today.slice(8, 10) === '01') out.push('GRADE_MENSAL');
  return out;
}

/** Semana ISO (segunda a domingo), ex.: 2026-W42. */
export function isoWeek(date: IsoDate): string {
  const t = new Date(`${date}T12:00:00Z`);
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const year = t.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 4, 12));
  const week = 1 + Math.round(((t.getTime() - first.getTime()) / 86_400_000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Período de cada envio: a semana, o sábado do fim de semana, o mês. */
export function periodKey(job: WaJobKey, today: IsoDate): string {
  if (job === 'LIDERES') return isoWeek(today);
  if (job === 'ESCALA_FDS') return nextSaturday(today);
  return today.slice(0, 7);
}

/** O sábado que vem (ou hoje, se já for sábado). */
export function nextSaturday(today: IsoDate): IsoDate {
  const wd = weekdayOf(today);
  return addDays(today, (6 - wd + 7) % 7);
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;
const dm = (d: IsoDate) => formatDateBR(d).slice(0, 5);
const wdShort = (d: IsoDate) => WEEKDAYS[weekdayOf(d) - 1]!.long.toLowerCase();

export interface LeaderDemand { title: string; sector: string; dueDate: string | null; late: boolean; priority: string }

export function leaderMessage(input: { name: string; demands: LeaderDemand[]; url: string }): string {
  const first = input.name.split(' ')[0];
  const late = input.demands.filter((d) => d.late);
  const soon = input.demands.filter((d) => !d.late);
  const line = (d: LeaderDemand) => `• ${d.priority === 'URGENTE' ? '🔴 ' : ''}${d.title}${d.dueDate ? ` — ${d.late ? 'venceu' : 'vence'} ${dm(d.dueDate)}` : ''} _(${d.sector})_`;
  const out = [`*Bom dia, ${first}! Suas demandas da semana* 📋`];
  if (late.length) out.push('', `*Atrasadas (${late.length})*`, ...late.map(line));
  if (soon.length) out.push('', `*Vencem nesta semana (${soon.length})*`, ...soon.map(line));
  out.push('', `Atualize o andamento em: ${input.url}`, '', '_Muitos esportes, muitas paixões, uma Nação!_ 💙');
  return out.join('\n');
}

export interface PersonalShift { date: IsoDate; startMin: number; endMin: number; sector: string; holiday?: string | null }

export function dutyPersonalMessage(input: { name: string; shifts: PersonalShift[] }): string {
  const first = input.name.split(' ')[0];
  const out = [`*Oi, ${first}! Sua escala deste fim de semana* 🔵`, ''];
  for (const s of [...input.shifts].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)) {
    out.push(`• *${wdShort(s.date)} ${dm(s.date)}*${s.holiday ? ` (${s.holiday})` : ''}: ${formatClock(s.startMin)}–${formatClock(s.endMin % 1440 || 1440)} · ${s.sector}`);
  }
  out.push('', 'Qualquer imprevisto, avise a coordenação o quanto antes.', '', '_Muitos esportes, muitas paixões, uma Nação!_ 💙');
  return out.join('\n');
}

export function monthlyGradeMessage(input: { month: string; gradeText: string }): string {
  return [
    `*📅 Grade de ${monthName(input.month)}*`,
    '',
    input.gradeText,
    '',
    '*Por favor, confira e responda esta mensagem:*',
    '✅ *OK* — está tudo certo',
    '✏️ ou descreva o que precisa ajustar (horário, aula, férias…).',
  ].join('\n');
}
