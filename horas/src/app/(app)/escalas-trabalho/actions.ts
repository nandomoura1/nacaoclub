'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import type { Analysis } from '@/domain/escalas/validate';
import * as ws from '@/server/services/ws-service';

const done = () => revalidatePath('/escalas-trabalho', 'layout');
async function act<T>(fn: (p: Awaited<ReturnType<typeof getPrincipal>>, meta: Awaited<ReturnType<typeof requestMeta>>) => Promise<T>, message?: string): Promise<ActionResult<T>> {
  return runAction(async () => { const r = await fn(await getPrincipal(), await requestMeta()); done(); return r; }, message);
}

export const saveSectorAction = async (id: string | null, input: unknown) => act((p, m) => ws.saveSector(p, id, input, m), 'Setor salvo.');
export const saveSectorHoursAction = async (sectorId: string, input: unknown) => act((p, m) => ws.saveSectorHours(p, sectorId, input, m), 'Horário do setor salvo.');
export const savePostAction = async (sectorId: string, id: string | null, input: unknown) => act((p, m) => ws.savePost(p, sectorId, id, input, m), 'Posto salvo.');
export const deletePostAction = async (sectorId: string, id: string) => act((p, m) => ws.deletePost(p, sectorId, id, m), 'Posto excluído.');
export const saveMemberAction = async (sectorId: string, id: string | null, input: unknown) => act((p, m) => ws.saveMember(p, sectorId, id, input, m), 'Colaborador salvo.');
export const removeMemberAction = async (sectorId: string, id: string) => act((p, m) => ws.removeMember(p, sectorId, id, m), 'Colaborador retirado da equipe.');
export const saveRuleAction = async (sectorId: string, id: string | null, input: unknown) => act((p, m) => ws.saveRule(p, sectorId, id, input, m), 'Pré-requisito salvo.');
export const deleteRuleAction = async (sectorId: string, id: string) => act((p, m) => ws.deleteRule(p, sectorId, id, m), 'Pré-requisito excluído.');
export const saveNacaoHoursAction = async (input: unknown) => act((p, m) => ws.saveNacaoHours(p, input, m), 'Horário da Nação salvo.');
export const saveOverrideAction = async (id: string | null, input: unknown) => act((p, m) => ws.saveOverride(p, id, input, m), 'Funcionamento especial salvo.');
export const deleteOverrideAction = async (id: string) => act((p, m) => ws.deleteOverride(p, id, m), 'Excluído.');
export const saveLegalAction = async (id: string | null, input: unknown) => act((p, m) => ws.saveLegal(p, id, input, m), 'Parâmetros salvos.');
export const saveAbsenceAction = async (sectorId: string, input: unknown) => act((p, m) => ws.saveAbsence(p, sectorId, input, m), 'Ausência registrada. A escala publicada não muda sozinha: confira os alertas na escala do mês.');
export const cancelAbsenceAction = async (sectorId: string, id: string) => act((p, m) => ws.cancelAbsence(p, sectorId, id, m), 'Ausência anulada.');
export const generateAction = async (sectorId: string, year: number, month: number) => act((p, m) => ws.generateSchedule(p, sectorId, year, month, m));
export const editCellAction = async (scheduleId: string, memberId: string, date: string, input: unknown): Promise<ActionResult<Analysis>> => act((p, m) => ws.editCell(p, scheduleId, memberId, date, input, m));
export const swapCellsAction = async (scheduleId: string, a: { memberId: string; date: string }, b: { memberId: string; date: string }): Promise<ActionResult<Analysis>> => act((p, m) => ws.swapCells(p, scheduleId, a, b, m));
export const setStatusAction = async (scheduleId: string, status: 'RASCUNHO' | 'APROVADA' | 'PUBLICADA') => act((p, m) => ws.setScheduleStatus(p, scheduleId, status, m));
export const loadModelsAction = async () => act((p, m) => ws.loadDocumentModels(p, m));
export const setRotationAction = async (sectorId: string, memberIds: string[]) => act((p, m) => ws.setRotation(p, sectorId, memberIds, m), memberIds.length ? 'Rodízio montado. Gere a escala de novo para aplicar.' : 'Rodízio desfeito.');
export const confirmDayAction = async (sectorId: string, date: string) => act((p, m) => ws.confirmDay(p, sectorId, date, m), 'Funcionamento confirmado.');
