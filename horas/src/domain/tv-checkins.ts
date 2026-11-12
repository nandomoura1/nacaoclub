/**
 * Check-ins na TV (puro): rótulo sem dado pessoal além do primeiro nome, aula "atual"
 * e casamento do horário da Tecnofit com o da nossa grade.
 * Decisões (12/11/2026): aparece por padrão e pode pedir para sair (opt-out); menores seguem a
 * mesma regra; contam só check-ins de turma e de CrossFit (catraca não diz a aula).
 */

const PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'van', 'von']);
const cap = (w: string) => w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1).toLocaleLowerCase('pt-BR');

/** "ANA MARIA DE SOUZA" → "Ana S."; "Bruno" → "Bruno". Nunca o sobrenome inteiro. */
export function tvLabel(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Aluno';
  const first = cap(parts[0]!);
  const last = [...parts.slice(1)].reverse().find((p) => !PARTICLES.has(p.toLowerCase()));
  return last ? `${first} ${last.charAt(0).toLocaleUpperCase('pt-BR')}.` : first;
}

/** "2026-11-12 07:00:00" | "07:00" | "07:00:00" → minutos desde a meia-noite (null se não der). */
export function minutesOf(v: string | null | undefined): number | null {
  const m = String(v ?? '').match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*$/) ?? String(v ?? '').match(/[ T](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * A TV troca de turma na hora cheia (decisão de 12/11): das 5h00 às 5h59 mostra a turma das 5h,
 * às 6h00 passa sozinha para a das 6h; hora sem turma = "sem turma neste horário" + a próxima.
 */
export const hourOf = (min: number) => Math.floor(min / 60);
/** Tolerância entre o horário da Tecnofit e o da grade. */
export const MATCH_TOLERANCE_MIN = 10;

export interface ClassWindow { startMin: number; durationMin: number }

/** Turmas que começam na hora cheia de agora (pode haver mais de uma: espaços diferentes). */
export function classesOfHour<T extends ClassWindow>(classes: T[], nowMin: number): T[] {
  return classes.filter((c) => hourOf(c.startMin) === hourOf(nowMin)).sort((a, b) => a.startMin - b.startMin);
}

/** Próxima turma do dia depois da hora atual (para "sem turma às 7h · próxima às 10h"). */
export function nextClass<T extends ClassWindow>(classes: T[], nowMin: number): T | null {
  return classes.filter((c) => hourOf(c.startMin) > hourOf(nowMin)).sort((a, b) => a.startMin - b.startMin)[0] ?? null;
}

/** Compatível com o uso antigo: a primeira turma da hora atual. */
export function currentClass<T extends ClassWindow>(classes: T[], nowMin: number): T | null {
  return classesOfHour(classes, nowMin)[0] ?? null;
}

export const sameClassTime = (gradeStartMin: number, tecnofitStartMin: number | null) =>
  tecnofitStartMin !== null && Math.abs(gradeStartMin - tecnofitStartMin) <= MATCH_TOLERANCE_MIN;

/** Check-in pertence à turma da hora: mesma hora cheia de início (05:00, 05:15… → turma das 5h). */
export const sameHour = (a: number, b: number | null) => b !== null && hourOf(a) === hourOf(b);

/** Normaliza para comparar nomes de turma × modalidade ("CrossFit 07h" ~ "CrossFit"). */
export const normName = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Sugestão de modalidade para uma turma da Tecnofit: a de nome mais longo contido no nome da turma/modalidade. */
export function suggestModality<M extends { id: string; name: string }>(tecnofitNames: string[], modalities: M[]): M | null {
  const hay = ` ${tecnofitNames.map(normName).join(' ')} `;
  return [...modalities].sort((a, b) => b.name.length - a.name.length).find((m) => hay.includes(` ${normName(m.name)} `) || hay.includes(` ${normName(m.name)}`)) ?? null;
}
