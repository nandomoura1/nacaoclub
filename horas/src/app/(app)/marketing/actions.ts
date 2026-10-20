'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { todayIso } from '@/lib/today';
import {
  addCampaignComment, deleteCalendarItem, deleteCampaign, deleteEvent, reschedule, saveAreaOwners, saveCalendarItem, saveCampaign, saveEvent, setCampaignStatus,
} from '@/server/services/marketing-service';
import { deleteColumn, reorderColumns, saveColumn } from '@/server/services/mkt-board-service';
import {
  addCheckItem, addTaskComment, addTaskLink, deleteTask, getTask, moveTask, removeCheckItem, removeTaskLink, saveTask, setDependencies, toggleCheckItem, type TaskDetail,
} from '@/server/services/mkt-task-service';
import {
  createMeeting, decideMinutes, decideRecommendation, decideTaskSuggestion, generateMinutes, refreshMeetingAgenda, refreshRecommendations, saveMeetingNotes, suggestCampaignTasks,
} from '@/server/services/mkt-ai-service';
import { importTrello, trelloAlreadyImported, type TrelloImportResult } from '@/server/services/mkt-trello-service';
import { analyzeSchedule, autoImportSchedule, commitSchedule, repeatEventNextYear, undoImport } from '@/server/services/mkt-import-service';
import { deleteKnowledge, draftKnowledge, saveKnowledge } from '@/server/services/mkt-memory-service';

const refresh = (...paths: string[]) => {
  revalidatePath('/marketing', 'layout');
  for (const p of paths) revalidatePath(p);
};

// Campanhas
export async function saveCampaignAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveCampaign(await getPrincipal(), id, values, await requestMeta()); refresh(); return r; }, 'Campanha salva.');
}
export async function setCampaignStatusAction(id: string, status: string): Promise<ActionResult> {
  return runAction(async () => { await setCampaignStatus(await getPrincipal(), id, status, await requestMeta()); refresh(); return undefined; }, 'Status atualizado.');
}
export async function deleteCampaignAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteCampaign(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Campanha excluída.');
}
export async function addCampaignCommentAction(id: string, body: string): Promise<ActionResult> {
  return runAction(async () => { await addCampaignComment(await getPrincipal(), id, body); refresh(); return undefined; });
}

// IA: sugestões de tarefas (aceite humano)
export async function suggestTasksAction(campaignId: string): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await suggestCampaignTasks(await getPrincipal(), campaignId, todayIso(), await requestMeta()); refresh(); return r; });
}
export async function decideSuggestionAction(suggestionId: string, decisions: unknown): Promise<ActionResult<{ created: number; status: string }>> {
  return runAction(async () => { const r = await decideTaskSuggestion(await getPrincipal(), suggestionId, decisions, todayIso(), await requestMeta()); refresh(); return r; });
}

// Eventos e calendário
export async function saveEventAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveEvent(await getPrincipal(), id, values, await requestMeta()); refresh(); return r; }, 'Evento salvo.');
}
export async function deleteEventAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteEvent(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Evento excluído.');
}
export async function saveCalendarItemAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveCalendarItem(await getPrincipal(), id, values, await requestMeta()); refresh(); return r; }, 'Item salvo no calendário.');
}
export async function deleteCalendarItemAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteCalendarItem(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Item removido.');
}
export async function rescheduleAction(kind: string, id: string, date: string): Promise<ActionResult> {
  return runAction(async () => { await reschedule(await getPrincipal(), kind, id, date, await requestMeta()); refresh(); return undefined; }, 'Data alterada.');
}

// Tarefas
export async function saveTaskAction(id: string | null, values: Record<string, unknown>, origin?: { origin?: 'MANUAL' | 'ANTECEDENCIA'; milestone?: string | null }): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveTask(await getPrincipal(), id, values, await requestMeta(), origin); refresh(); return r; }, 'Tarefa salva.');
}
export async function getTaskAction(id: string): Promise<ActionResult<TaskDetail>> {
  return runAction(async () => getTask(await getPrincipal(), id));
}
export async function moveTaskAction(id: string, column: string, beforeId: string | null, afterId: string | null): Promise<ActionResult> {
  return runAction(async () => { await moveTask(await getPrincipal(), id, column, beforeId, afterId, await requestMeta()); refresh(); return undefined; });
}
export async function deleteTaskAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteTask(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Tarefa excluída.');
}
export async function addCheckItemAction(taskId: string, text: string): Promise<ActionResult> {
  return runAction(async () => { await addCheckItem(await getPrincipal(), taskId, text, await requestMeta()); refresh(); return undefined; });
}
export async function toggleCheckItemAction(itemId: string, done: boolean): Promise<ActionResult> {
  return runAction(async () => { await toggleCheckItem(await getPrincipal(), itemId, done); refresh(); return undefined; });
}
export async function removeCheckItemAction(itemId: string): Promise<ActionResult> {
  return runAction(async () => { await removeCheckItem(await getPrincipal(), itemId); refresh(); return undefined; });
}
export async function addTaskLinkAction(taskId: string, url: string, label: string | null): Promise<ActionResult> {
  return runAction(async () => { await addTaskLink(await getPrincipal(), taskId, url, label, await requestMeta()); refresh(); return undefined; });
}
export async function removeTaskLinkAction(linkId: string): Promise<ActionResult> {
  return runAction(async () => { await removeTaskLink(await getPrincipal(), linkId); refresh(); return undefined; });
}
export async function setDependenciesAction(taskId: string, ids: string[]): Promise<ActionResult> {
  return runAction(async () => { await setDependencies(await getPrincipal(), taskId, ids, await requestMeta()); refresh(); return undefined; });
}
export async function addTaskCommentAction(taskId: string, body: string): Promise<ActionResult> {
  return runAction(async () => { await addTaskComment(await getPrincipal(), taskId, body); return undefined; });
}

// Reunião e recomendações
export async function createMeetingAction(date: string): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await createMeeting(await getPrincipal(), date, await requestMeta()); refresh(); return r; });
}
export async function refreshAgendaAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await refreshMeetingAgenda(await getPrincipal(), id); refresh(); return undefined; }, 'Pauta atualizada.');
}
export async function saveMeetingNotesAction(id: string, notes: string, minutes: string | null): Promise<ActionResult> {
  return runAction(async () => { await saveMeetingNotes(await getPrincipal(), id, notes, minutes, await requestMeta()); refresh(); return undefined; }, 'Salvo.');
}
export async function generateMinutesAction(id: string): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await generateMinutes(await getPrincipal(), id, await requestMeta()); refresh(); return r; });
}
export async function decideMinutesAction(suggestionId: string, minutes: string, accept: number[]): Promise<ActionResult<number>> {
  return runAction(async () => { const r = await decideMinutes(await getPrincipal(), suggestionId, { minutes, accept }, await requestMeta()); refresh(); return r; });
}
export async function refreshRecommendationsAction(): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await refreshRecommendations(await getPrincipal(), todayIso(), await requestMeta()); refresh(); return r; });
}
export async function decideRecommendationAction(suggestionId: string, index: number, accept: boolean): Promise<ActionResult<string | null>> {
  return runAction(async () => { const r = await decideRecommendation(await getPrincipal(), suggestionId, index, accept, todayIso(), await requestMeta()); refresh(); return r; }, accept ? 'Tarefa criada a partir da recomendação.' : 'Recomendação ignorada.');
}

// Configurações
export async function saveAreaOwnersAction(areaId: string, userId: string | null, coOwnerIds: string[]): Promise<ActionResult> {
  return runAction(async () => { await saveAreaOwners(await getPrincipal(), areaId, userId, coOwnerIds, await requestMeta()); refresh(); return undefined; }, 'Responsáveis salvos.');
}

// Colunas do Kanban
export async function saveColumnAction(id: string | null, values: { name: string; color: string | null; stage: string }): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveColumn(await getPrincipal(), id, values, await requestMeta()); refresh(); return r; }, 'Coluna salva.');
}
export async function reorderColumnsAction(ids: string[]): Promise<ActionResult> {
  return runAction(async () => { await reorderColumns(await getPrincipal(), ids, await requestMeta()); refresh(); return undefined; });
}
export async function deleteColumnAction(id: string, moveToId: string | null): Promise<ActionResult> {
  return runAction(async () => { await deleteColumn(await getPrincipal(), id, moveToId, await requestMeta()); refresh(); return undefined; }, 'Coluna excluída.');
}

// Importação do Trello
export async function trelloAlreadyImportedAction(cardIds: string[]): Promise<ActionResult<string[]>> {
  return runAction(async () => trelloAlreadyImported(await getPrincipal(), cardIds));
}
export async function importTrelloAction(input: unknown): Promise<ActionResult<TrelloImportResult>> {
  return runAction(async () => { const r = await importTrello(await getPrincipal(), input, await requestMeta()); refresh('/marketing/kanban'); return r; });
}

// Cronograma (documento → base) e Memória da Nação
const docInput = (fd: FormData) => {
  const f = fd.get('file');
  return { file: f instanceof File && f.size ? f : null, text: typeof fd.get('text') === 'string' ? String(fd.get('text')) : null };
};
export async function analyzeScheduleAction(fd: FormData): Promise<ActionResult<string>> {
  return runAction(async () => analyzeSchedule(await getPrincipal(), docInput(fd), todayIso(), await requestMeta()));
}
export async function commitScheduleAction(suggestionId: string, decisions: unknown): Promise<ActionResult<{ eventos: number; campanhas: number; datas: number; duplicados: number }>> {
  return runAction(async () => { const r = await commitSchedule(await getPrincipal(), suggestionId, decisions, await requestMeta()); refresh(); return r; });
}
export async function autoImportScheduleAction(suggestionId: string): Promise<ActionResult<{ importId: string; eventos: number; campanhas: number; datas: number; duplicados: number }>> {
  return runAction(async () => { const r = await autoImportSchedule(await getPrincipal(), suggestionId, todayIso(), await requestMeta()); refresh(); return r; });
}
export async function undoImportAction(importId: string): Promise<ActionResult<{ removidos: number; mantidos: number }>> {
  return runAction(async () => { const r = await undoImport(await getPrincipal(), importId, await requestMeta()); refresh(); return r; });
}
export async function repeatEventAction(eventId: string): Promise<ActionResult<{ id: string; date: string }>> {
  return runAction(async () => { const r = await repeatEventNextYear(await getPrincipal(), eventId, await requestMeta()); refresh('/marketing/eventos'); return r; });
}
export async function draftKnowledgeAction(fd: FormData): Promise<ActionResult<{ title: string; content: string; source: string }>> {
  return runAction(async () => draftKnowledge(await getPrincipal(), docInput(fd), await requestMeta()));
}
export async function saveKnowledgeAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveKnowledge(await getPrincipal(), id, values, await requestMeta()); refresh('/marketing/memoria'); return r; }, 'Memória salva.');
}
export async function deleteKnowledgeAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteKnowledge(await getPrincipal(), id, await requestMeta()); refresh('/marketing/memoria'); return undefined; }, 'Memória excluída.');
}
