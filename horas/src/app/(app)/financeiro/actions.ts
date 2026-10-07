'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { AppError } from '@/server/errors';
import type { Metrics } from '@/domain/financeiro/metrics';
import type { Analysis } from '@/server/financeiro/analysis';
import {
  addFinLine, analyzeHistoricReport, approveFinPeriod, commitHistoricReport, confirmFinLines, createFinPeriod, deleteFinDocument, deleteFinLine,
  discardHistoricReport, previewMetrics, processFinDocument, runFinAnalysis, saveCategory, saveFinNotes, saveFinTargets, saveReconciliation,
  updateFinLine, uploadFinDocument, analyzeFinPackage, commitFinPackage, isFinPackageFile, type FinPackageAnalysis, type HistoricAnalysis,
} from '@/server/services/fin-service';

const refresh = (month?: string) => {
  revalidatePath('/financeiro');
  revalidatePath('/financeiro/competencias');
  revalidatePath('/financeiro/historico');
  if (month) revalidatePath(`/financeiro/competencias/${month}`);
};
const fileOf = (form: FormData) => {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw new AppError('Escolha o arquivo.');
  return file;
};

export async function createPeriodAction(month: string): Promise<ActionResult<{ month: string; existed: boolean }>> {
  return runAction(async () => { const r = await createFinPeriod(await getPrincipal(), month, await requestMeta()); refresh(month); return r; });
}
export async function saveNotesAction(month: string, values: { managerNotes?: string | null; partnerDecisions?: string | null }): Promise<ActionResult> {
  return runAction(async () => { await saveFinNotes(await getPrincipal(), month, values, await requestMeta()); refresh(month); return undefined; }, 'Observações salvas.');
}
export async function saveReconciliationAction(month: string, key: string, justification: string): Promise<ActionResult> {
  return runAction(async () => { await saveReconciliation(await getPrincipal(), month, key, justification, await requestMeta()); refresh(month); return undefined; }, 'Justificativa salva.');
}

/** Envia e já processa (extração pela IA). Se a leitura falhar, o arquivo fica guardado com o erro. */
export async function uploadDocumentAction(month: string, form: FormData): Promise<ActionResult<{ lines: number; warnings: string[] }>> {
  return runAction(async () => {
    const principal = await getPrincipal();
    const meta = await requestMeta();
    const kind = String(form.get('kind') ?? '');
    const notes = String(form.get('notes') ?? '') || null;
    const id = await uploadFinDocument(principal, month, kind, fileOf(form), notes, meta);
    try {
      return await processFinDocument(principal, id, meta);
    } finally {
      refresh(month);
    }
  });
}
export async function processDocumentAction(month: string, id: string): Promise<ActionResult<{ lines: number; warnings: string[] }>> {
  return runAction(async () => { try { return await processFinDocument(await getPrincipal(), id, await requestMeta()); } finally { refresh(month); } });
}
export async function deleteDocumentAction(month: string, id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteFinDocument(await getPrincipal(), id, await requestMeta()); refresh(month); return undefined; }, 'Documento removido.');
}

export async function confirmLinesAction(month: string, ids: string[] | 'all'): Promise<ActionResult<number>> {
  return runAction(async () => { const n = await confirmFinLines(await getPrincipal(), month, ids, await requestMeta()); refresh(month); return n; });
}
export async function updateLineAction(month: string, id: string, values: Record<string, unknown>): Promise<ActionResult> {
  return runAction(async () => { await updateFinLine(await getPrincipal(), id, values, await requestMeta()); refresh(month); return undefined; }, 'Dado corrigido.');
}
export async function addLineAction(month: string, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const id = await addFinLine(await getPrincipal(), month, values, await requestMeta()); refresh(month); return id; }, 'Dado incluído.');
}
export async function deleteLineAction(month: string, id: string, reason: string | null): Promise<ActionResult> {
  return runAction(async () => { await deleteFinLine(await getPrincipal(), id, reason, await requestMeta()); refresh(month); return undefined; }, 'Dado excluído.');
}

export async function approveAction(month: string, reason: string | null): Promise<ActionResult<number>> {
  return runAction(async () => { const n = await approveFinPeriod(await getPrincipal(), month, reason, await requestMeta()); refresh(month); return n; });
}
export async function analysisAction(month: string): Promise<ActionResult<Analysis>> {
  return runAction(async () => { const a = await runFinAnalysis(await getPrincipal(), month, await requestMeta()); refresh(month); return a; });
}

/** Pacote histórico (planilha estruturada) é lido sem IA; qualquer outro relatório vai para a leitura por IA. */
export async function analyzeHistoricAction(form: FormData): Promise<ActionResult<{ kind: 'pacote'; data: FinPackageAnalysis } | { kind: 'relatorio'; data: HistoricAnalysis }>> {
  return runAction(async () => {
    const file = fileOf(form);
    const principal = await getPrincipal();
    if (await isFinPackageFile(file)) return { kind: 'pacote' as const, data: await analyzeFinPackage(principal, file, await requestMeta()) };
    return { kind: 'relatorio' as const, data: await analyzeHistoricReport(principal, file, await requestMeta()) };
  });
}
export async function commitPackageAction(documentId: string, months: string[]): Promise<ActionResult<{ months: string[]; lines: number }>> {
  return runAction(async () => { const r = await commitFinPackage(await getPrincipal(), { documentId, months }, await requestMeta()); refresh(); for (const m of r.months) revalidatePath(`/financeiro/competencias/${m}`); return r; });
}
export async function previewHistoricAction(lines: unknown): Promise<ActionResult<Metrics>> {
  return runAction(async () => previewMetrics(await getPrincipal(), lines));
}
export async function commitHistoricAction(input: Record<string, unknown>): Promise<ActionResult<{ month: string; version: number | null }>> {
  return runAction(async () => { const r = await commitHistoricReport(await getPrincipal(), input, await requestMeta()); refresh(r.month); return r; });
}
export async function discardHistoricAction(documentId: string): Promise<ActionResult> {
  return runAction(async () => { await discardHistoricReport(await getPrincipal(), documentId, await requestMeta()); return undefined; });
}

export async function saveTargetsAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction(async () => { await saveFinTargets(await getPrincipal(), values, await requestMeta()); refresh(); revalidatePath('/financeiro/configuracoes'); return undefined; }, 'Metas salvas.');
}
export async function saveCategoryAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction(async () => { await saveCategory(await getPrincipal(), values, await requestMeta()); refresh(); revalidatePath('/financeiro/configuracoes'); return undefined; }, 'Categoria salva.');
}
