/**
 * Colunas do Kanban de Marketing (puro). As colunas são editáveis, mas cada
 * uma "funciona como" uma etapa fixa — é a etapa que conta para prontidão,
 * atraso e conclusão. Tarefa sem coluna (criada por IA, Trello, antecedência)
 * cai na primeira coluna da sua etapa, ou na mais próxima.
 */
import { DONE_COLUMNS, TASK_COLUMNS, type TaskColumn } from './constants';

export interface BoardColumn { id: string; name: string; color: string | null; stage: TaskColumn; position: number }

/** Como cada etapa aparece em "Funciona como". */
export const STAGES: { id: TaskColumn; label: string }[] = [
  { id: 'BACKLOG', label: 'A fazer / ideias' },
  { id: 'PROXIMAS', label: 'Planejado (próximas)' },
  { id: 'SEMANA', label: 'Para esta semana' },
  { id: 'PRODUCAO', label: 'Em andamento' },
  { id: 'APROVACAO', label: 'Em aprovação' },
  { id: 'PROGRAMADO', label: 'Programado / agendado' },
  { id: 'EXECUTADO', label: 'Concluído ✔' },
  { id: 'RESULTADOS', label: 'Concluído ✔ (resultados)' },
];
export const stageLabel = (s: string) => STAGES.find((x) => x.id === s)?.label ?? s;
const order = (s: string) => TASK_COLUMNS.findIndex((c) => c.id === s);

export const sortColumns = <T extends Pick<BoardColumn, 'position' | 'name'>>(cols: T[]) => [...cols].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'pt-BR'));

/** Em que coluna a tarefa aparece. */
export function columnFor<T extends BoardColumn>(task: { columnId: string | null; column: string }, cols: T[]): T | null {
  if (!cols.length) return null;
  const own = task.columnId ? cols.find((c) => c.id === task.columnId) : undefined;
  if (own) return own;
  const sorted = sortColumns(cols);
  const target = order(task.column);
  return sorted.reduce((best, c) => (Math.abs(order(c.stage) - target) < Math.abs(order(best.stage) - target) ? c : best), sorted[0]!);
}

/** Regras do quadro: pelo menos uma coluna e pelo menos uma de "concluído". */
export function checkColumns(cols: Pick<BoardColumn, 'stage'>[]): string | null {
  if (!cols.length) return 'O quadro precisa de pelo menos uma coluna.';
  if (!cols.some((c) => (DONE_COLUMNS as string[]).includes(c.stage))) return 'Mantenha pelo menos uma coluna que funcione como “Concluído”.';
  return null;
}
