'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCheck, ClipboardPaste, X, CheckCircle2, Download, Eye, FileUp, History, Pencil, Plus, Printer, RefreshCw, Save, Sparkles, Trash2, TriangleAlert,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label } from '@/components/ui/input';
import { monthTitle } from '@/domain/condominio/months';
import { DATASETS, DOC_KINDS, type DocKind } from '@/domain/financeiro/taxonomy';
import { KEY_INDICATORS } from '@/domain/financeiro/metrics';
import { cn } from '@/lib/cn';
import type { FinPeriodView } from '@/server/services/fin-service';
import { DOC_STATUS, FIN_STATUS, Kpi } from '../../_components/fmt';
import { LineForm, datasetLabel, keyLabel, lineValue, type CategoryOption, type LineDraft } from '../../_components/lines';
import { ReportView, type ReportMode } from '../../_components/ReportView';
import { compressImage, imagesFrom, isImage, MAX_PRINTS } from '../../_components/screenshots';
import {
  addLineAction, analysisAction, approveAction, confirmLinesAction, deleteDocumentAction, deleteLineAction, processDocumentAction,
  saveNotesAction, saveReconciliationAction, updateLineAction, uploadDocumentAction,
} from '../../actions';

const TABS = [
  { id: 'documentos', label: '1 · Documentos' },
  { id: 'conferencia', label: '2 · Conferência' },
  { id: 'indicadores', label: '3 · Indicadores' },
  { id: 'relatorio', label: '4 · Relatório' },
  { id: 'versoes', label: 'Versões' },
] as const;
type Tab = (typeof TABS)[number]['id'];
const ACCEPT = '.pdf,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.docx,.txt,.md,.html,.htm';
const LINE_STATUS: Record<string, { label: string; tone: 'amber' | 'green' | 'blue' | 'neutral' }> = {
  EXTRACTED: { label: 'para conferir', tone: 'amber' },
  CONFIRMED: { label: 'confirmado', tone: 'green' },
  EDITED: { label: 'corrigido', tone: 'blue' },
  MANUAL: { label: 'manual', tone: 'neutral' },
};

type Perms = { canImport: boolean; canEdit: boolean; canApprove: boolean };
type Msg = { error?: string | null; ok?: string | null };

export function PeriodClient({ p, categories, perms }: { p: FinPeriodView; categories: CategoryOption[]; perms: Perms }) {
  const router = useRouter();
  const pendingLines = p.lines.filter((l) => l.status === 'EXTRACTED').length;
  const [tab, setTab] = useState<Tab>(p.status === 'APPROVED' ? 'relatorio' : pendingLines ? 'conferencia' : 'documentos');
  const [msg, setMsg] = useState<Msg>({});
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      setMsg({});
      const r = await fn();
      if (!r.ok) return setMsg({ error: r.error });
      setMsg({ ok: r.message ?? null });
      after?.();
      router.refresh();
    });
  const approved = p.version > 0;
  const st = FIN_STATUS[p.status];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/financeiro/competencias" className={buttonVariants({ variant: 'ghost', size: 'sm' })}><ArrowLeft /> Relatórios</Link>
        <h1 className="text-2xl font-extrabold text-navy">{monthTitle(p.month)}</h1>
        <Badge tone={st?.tone}>{st?.label ?? p.status}</Badge>
        {approved && <Badge tone="navy">versão {p.version} aprovada</Badge>}
        {pendingLines > 0 && <Badge tone="amber">{pendingLines} para conferir</Badge>}
      </div>
      {approved && p.status !== 'APPROVED' && (
        <p className="rounded-lg border border-atencao/40 bg-atencao/5 p-3 text-sm print:hidden">
          Há alterações depois da versão {p.version}. O painel e o histórico continuam usando a versão {p.version} até você aprovar de novo.
        </p>
      )}
      <nav className="flex gap-1 overflow-x-auto border-b border-borda print:hidden" aria-label="Etapas">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setMsg({}); }} className={cn('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold', tab === t.id ? 'border-nacao text-nacao' : 'border-transparent text-tinta-suave hover:text-tinta')}>
            {t.label}{t.id === 'conferencia' && pendingLines > 0 ? ` (${pendingLines})` : ''}
          </button>
        ))}
      </nav>
      <div className="print:hidden"><FormMessage error={msg.error} success={msg.ok} /></div>

      {tab === 'documentos' && <DocumentsTab p={p} perms={perms} pending={pending} run={run} setMsg={setMsg} />}
      {tab === 'conferencia' && <ReviewTab p={p} categories={categories} perms={perms} pending={pending} run={run} />}
      {tab === 'indicadores' && <IndicatorsTab p={p} perms={perms} pending={pending} run={run} />}
      {tab === 'relatorio' && <ReportTab p={p} perms={perms} pending={pending} run={run} />}
      {tab === 'versoes' && <VersionsTab p={p} />}

      {tab !== 'versoes' && perms.canApprove && <ApproveBar p={p} pendingLines={pendingLines} pending={pending} run={run} />}
    </div>
  );
}

type RunFn = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) => void;

// ── 1. Documentos ────────────────────────────────────────────

function DocumentsTab({ p, perms, pending, run, setMsg }: { p: FinPeriodView; perms: Perms; pending: boolean; run: RunFn; setMsg: (m: Msg) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const upload = async (kind: DocKind, files: File[], notes: string) => {
    setBusy(kind);
    setMsg({});
    const fd = new FormData();
    fd.set('kind', kind);
    for (const f of files) fd.append('file', f);
    if (notes) fd.set('notes', notes);
    const r = await uploadDocumentAction(p.month, fd);
    setBusy(null);
    const what = files.length > 1 ? `${files.length} prints` : files[0]!.name;
    if (!r.ok) setMsg({ error: r.error });
    else setMsg({ ok: `${what}: ${r.data.lines} dado(s) lido(s)${r.data.warnings.length ? ` e ${r.data.warnings.length} aviso(s)` : ''}. Confira na aba Conferência.` });
    router.refresh();
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-tinta-suave">Envie cada documento no seu card. O sistema lê o arquivo (IA), guarda o original e separa os números para você conferir — nada entra no relatório sem conferência. PDF, XLSX, CSV, DOCX, TXT, HTML ou <b>prints de tela</b> — cole com Ctrl+V, arraste ou escolha vários de uma vez (viram um documento só).</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
        {DOC_KINDS.map((k) => (
          <DocCard key={k.id} kind={k} docs={p.documents.filter((d) => d.kind === k.id)} canImport={perms.canImport}
            busy={busy === k.id} anyBusy={!!busy || pending} onUpload={upload}
            onProcess={(id) => { setBusy(k.id); run(() => processDocumentAction(p.month, id), () => setBusy(null)); }}
            onDelete={(id) => { if (confirm('Remover este documento e os dados ainda não conferidos dele?')) run(() => deleteDocumentAction(p.month, id)); }} />
        ))}
      </div>
      {busy && <p className="text-sm font-semibold text-nacao">Lendo o documento com IA… pode levar de 30 segundos a 2 minutos. Não feche a página.</p>}
    </div>
  );
}

function DocCard({ kind, docs, canImport, busy, anyBusy, onUpload, onProcess, onDelete }: {
  kind: (typeof DOC_KINDS)[number]; docs: FinPeriodView['documents']; canImport: boolean; busy: boolean; anyBusy: boolean;
  onUpload: (kind: DocKind, files: File[], notes: string) => void; onProcess: (id: string) => void; onDelete: (id: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState('');
  const [prints, setPrints] = useState<{ file: File; url: string }[]>([]);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  // Imagens entram na fila (comprimidas); documento (PDF, planilha…) vai direto.
  const add = async (files: File[]) => {
    setErr(null);
    const docs = files.filter((f) => !isImage(f));
    const imgs = files.filter(isImage);
    if (docs.length) {
      if (docs.length > 1 || imgs.length || prints.length) return setErr('PDF e planilha vão um por vez; prints podem ir vários juntos.');
      onUpload(kind.id, docs, notes);
      setNotes('');
      return;
    }
    if (prints.length + imgs.length > MAX_PRINTS) return setErr(`No máximo ${MAX_PRINTS} prints por documento.`);
    setPreparing(true);
    try {
      const out = await Promise.all(imgs.map((f, i) => compressImage(f, prints.length + i + 1)));
      setPrints((cur) => [...cur, ...out.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui ler a imagem.');
    } finally {
      setPreparing(false);
    }
  };
  const removePrint = (i: number) => setPrints((cur) => { URL.revokeObjectURL(cur[i]!.url); return cur.filter((_, j) => j !== i); });
  const sendPrints = () => {
    const files = prints.map((x) => x.file);
    prints.forEach((x) => URL.revokeObjectURL(x.url));
    setPrints([]);
    onUpload(kind.id, files, notes);
    setNotes('');
  };
  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-navy">{kind.label}</p>
          <p className="text-xs text-tinta-suave">{kind.hint}</p>
        </div>
        {docs.length > 0 ? <Badge tone="green">{docs.length} arquivo{docs.length > 1 ? 's' : ''}</Badge> : <Badge>pendente</Badge>}
      </div>
      {docs.map((d) => {
        const s = DOC_STATUS[d.status];
        return (
          <div key={d.id} className="rounded-lg border border-borda p-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-semibold text-tinta" title={d.filename}>{d.filename}</span>
              <Badge tone={s?.tone}>{s?.label ?? d.status}</Badge>
            </div>
            <p className="mt-0.5 text-tinta-fraca">v{d.version} · {(d.sizeBytes / 1024).toFixed(0)} KB · {new Date(d.createdAt).toLocaleDateString('pt-BR')}{d.uploadedBy ? ` · ${d.uploadedBy}` : ''}{d.identified ? ` · lido como: ${d.identified}` : ''}</p>
            {d.notes && <p className="mt-0.5 italic text-tinta-suave">{d.notes}</p>}
            {d.error && <p className="mt-1 font-semibold text-critico">{d.error}</p>}
            {d.warnings.length > 0 && <ul className="mt-1 list-disc pl-4 text-atencao">{d.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
            <div className="mt-1 flex flex-wrap gap-1">
              <a href={`/financeiro/documentos/${d.id}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'ghost', size: 'sm' })}><Download /> Original</a>
              {canImport && <Button variant="ghost" size="sm" disabled={anyBusy} onClick={() => onProcess(d.id)}><RefreshCw /> Ler de novo</Button>}
              {canImport && <Button variant="ghost" size="sm" disabled={anyBusy} onClick={() => onDelete(d.id)}><Trash2 /> Remover</Button>}
            </div>
          </div>
        );
      })}
      {canImport && (
        <div className="mt-auto space-y-1.5">
          <div
            tabIndex={0}
            role="button"
            aria-label={`Colar ou arrastar prints para ${kind.label}`}
            onPaste={(e) => { const imgs = imagesFrom(e.clipboardData?.items); if (imgs.length) { e.preventDefault(); void add(imgs); } }}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void add(Array.from(e.dataTransfer.files)); }}
            className={cn('flex cursor-text flex-col items-center gap-1 rounded-xl border-2 border-dashed px-3 py-3 text-center text-xs outline-none transition-colors focus:border-nacao focus:bg-nacao/5',
              drag ? 'border-nacao bg-nacao/10' : 'border-borda hover:border-nacao/50')}
          >
            <ClipboardPaste className="size-5 text-nacao" />
            <span className="font-semibold text-tinta">{preparing ? 'Preparando prints…' : 'Clique aqui e cole o print (Ctrl+V)'}</span>
            <span className="text-tinta-fraca">ou arraste os arquivos para cá</span>
          </div>
          {prints.length > 0 && (
            <div className="rounded-xl bg-fundo p-2">
              <div className="flex flex-wrap gap-1.5">
                {prints.map((x, i) => (
                  <div key={x.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={x.url} alt={`Print ${i + 1}`} className="h-14 w-14 rounded-md border border-borda object-cover object-top" />
                    <span className="absolute left-0.5 top-0.5 rounded bg-navy/80 px-1 text-[9px] font-bold text-white">{i + 1}</span>
                    <button type="button" onClick={() => removePrint(i)} aria-label={`Tirar print ${i + 1}`} className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-critico text-white"><X className="size-3" /></button>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-tinta-suave">{prints.length} print(s) na ordem em que vão ser lidos. Cole mais se o documento continuar.</p>
            </div>
          )}
          {err && <p className="text-xs font-semibold text-critico">{err}</p>}
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observação (opcional)" className="h-8 text-xs" />
          <input ref={ref} type="file" accept={`${ACCEPT},image/*`} multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) void add(fs); }} />
          {prints.length > 0 ? (
            <Button size="sm" className="w-full" disabled={anyBusy || preparing} onClick={sendPrints}>
              <FileUp /> {busy ? 'Lendo…' : `Enviar ${prints.length} print${prints.length > 1 ? 's' : ''} e processar`}
            </Button>
          ) : (
            <Button size="sm" variant="secondary" className="w-full" disabled={anyBusy || preparing} onClick={() => ref.current?.click()}>
              <FileUp /> {busy ? 'Lendo…' : docs.length ? 'Enviar outro arquivo' : 'Escolher arquivo'}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// ── 2. Conferência ───────────────────────────────────────────

type Line = FinPeriodView['lines'][number];

function ReviewTab({ p, categories, perms, pending, run }: { p: FinPeriodView; categories: CategoryOption[]; perms: Perms; pending: boolean; run: RunFn }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [origin, setOrigin] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);
  const pendingCount = p.lines.filter((l) => l.status === 'EXTRACTED').length;
  const approved = p.version > 0;
  const shown = onlyPending ? p.lines.filter((l) => l.status === 'EXTRACTED') : p.lines;
  const groups = DATASETS.map((d) => ({ ...d, lines: shown.filter((l) => l.dataset === d.id) })).filter((g) => g.lines.length);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-tinta-suave">Confira cada número com o documento original. <b>Confirmar</b> aceita; <b>Editar</b> corrige (fica registrado na auditoria). {approved && 'Esta competência já foi aprovada: toda alteração pede motivo.'}</p>
        <label className="flex items-center gap-1 text-xs text-tinta-suave"><input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> só os não conferidos</label>
        {perms.canEdit && pendingCount > 0 && <Button size="sm" disabled={pending} onClick={() => { if (confirm(`Confirmar os ${pendingCount} dados ainda não conferidos?`)) run(() => confirmLinesAction(p.month, 'all')); }}><CheckCheck /> Confirmar todos ({pendingCount})</Button>}
        {perms.canEdit && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}><Plus /> Incluir dado</Button>}
      </div>
      {adding && (
        <LineForm initial={{ dataset: 'DESPESA', key: null, label: '', unit: null, amountCents: null, quantity: null, classification: null, meta: null }}
          categories={categories} needReason={approved} pending={pending} submitLabel="Incluir"
          onCancel={() => setAdding(false)} onSave={(l, reason) => run(() => addLineAction(p.month, { ...l, reason: reason ?? undefined }), () => setAdding(false))} />
      )}
      {groups.length === 0 && <Card className="p-4 text-sm text-tinta-suave">{p.lines.length ? 'Tudo conferido.' : 'Nenhum dado ainda. Envie os documentos na aba Documentos.'}</Card>}
      {groups.map((g) => {
        const total = g.lines.reduce((s, l) => s + (l.amountCents ?? 0), 0);
        return (
          <Card key={g.id} className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-borda bg-fundo px-3 py-2 text-sm">
              <b className="flex-1 text-navy">{g.label}</b>
              <span className="text-xs text-tinta-suave">{g.lines.length} dado(s){g.lines.some((l) => l.amountCents !== null) ? ` · ${lineValue({ dataset: g.id, key: null, amountCents: total, quantity: null })}` : ''}</span>
            </div>
            <ul className="divide-y divide-borda">
              {g.lines.map((l) => (
                <li key={l.id} className="p-2 text-sm">
                  {editing === l.id ? (
                    <LineForm initial={l} categories={categories} needReason={approved} pending={pending}
                      onCancel={() => setEditing(null)} onSave={(v, reason) => run(() => updateLineAction(p.month, l.id, { ...v, reason: reason ?? undefined }), () => setEditing(null))} />
                  ) : (
                    <LineRow l={l} categories={categories} doc={l.documentName} canEdit={perms.canEdit} pending={pending}
                      showOrigin={origin === l.id} onOrigin={() => setOrigin(origin === l.id ? null : l.id)}
                      onConfirm={() => run(() => confirmLinesAction(p.month, [l.id]))} onEdit={() => setEditing(l.id)}
                      onDelete={() => {
                        const reason = approved ? prompt('Motivo da exclusão (obrigatório):') : null;
                        if (approved && !reason) return;
                        if (!approved && !confirm(`Excluir "${l.label}"?`)) return;
                        run(() => deleteLineAction(p.month, l.id, reason));
                      }} />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function LineRow({ l, categories, doc, canEdit, pending, showOrigin, onOrigin, onConfirm, onEdit, onDelete }: {
  l: Line; categories: CategoryOption[]; doc: string | null; canEdit: boolean; pending: boolean; showOrigin: boolean;
  onOrigin: () => void; onConfirm: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const s = LINE_STATUS[l.status];
  const k = keyLabel(l.dataset, l.key, categories);
  const ca = l.meta?.contaAssinadaClasse;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-tinta" title={l.label}>{l.label}{l.unit ? <span className="font-normal text-tinta-suave"> · {l.unit}</span> : null}</p>
          <p className="text-xs text-tinta-suave">
            {k ? k : <span className="text-atencao">sem categoria</span>}
            {l.classification ? ` · ${l.classification}` : ''}{ca ? ` · Conta Assinada: ${String(ca)}` : ''}
            {l.confirmedBy && l.status !== 'EXTRACTED' ? ` · ${l.confirmedBy}` : ''}
          </p>
        </div>
        <span className="font-bold tabular-nums text-navy">{lineValue(l)}</span>
        <Badge tone={s?.tone}>{s?.label ?? l.status}</Badge>
        <div className="flex gap-1">
          {(l.sourceRef || l.rule || doc) && <Button variant="ghost" size="sm" onClick={onOrigin} aria-label="Ver origem"><Eye /> <span className="hidden sm:inline">Origem</span></Button>}
          {canEdit && l.status === 'EXTRACTED' && <Button variant="secondary" size="sm" disabled={pending} onClick={onConfirm}><CheckCircle2 /> Confirmar</Button>}
          {canEdit && <Button variant="ghost" size="sm" onClick={onEdit} aria-label="Editar"><Pencil /></Button>}
          {canEdit && <Button variant="ghost" size="sm" disabled={pending} onClick={onDelete} aria-label="Excluir"><Trash2 /></Button>}
        </div>
      </div>
      {showOrigin && (
        <dl className="mt-1 grid gap-x-4 rounded-lg bg-fundo p-2 text-xs sm:grid-cols-[8rem_1fr]">
          {doc && <><dt className="text-tinta-suave">Documento</dt><dd className="break-words">{doc}</dd></>}
          {l.sourceRef && <><dt className="text-tinta-suave">Onde</dt><dd className="break-words">{l.sourceRef}</dd></>}
          {l.sourceValue && <><dt className="text-tinta-suave">Valor original</dt><dd className="break-words font-mono">{l.sourceValue}</dd></>}
          {l.rule && <><dt className="text-tinta-suave">Regra aplicada</dt><dd className="break-words">{l.rule}</dd></>}
        </dl>
      )}
    </div>
  );
}

// ── 3. Indicadores, conciliações e observações ───────────────

function IndicatorsTab({ p, perms, pending, run }: { p: FinPeriodView; perms: Perms; pending: boolean; run: RunFn }) {
  const m = p.metrics;
  const [notes, setNotes] = useState(p.managerNotes ?? '');
  const [decisions, setDecisions] = useState(p.partnerDecisions ?? '');
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 [&>*]:min-w-0">
        {KEY_INDICATORS.map((k) => <Kpi key={k.key} label={k.label} ind={k.get(m)} />)}
      </div>
      <p className="text-xs text-tinta-fraca">Passe o mouse sobre um valor para ver a fórmula. Indicadores sem base aparecem como “Dado não informado” — o sistema nunca copia do mês anterior.</p>

      <Card className="p-4">
        <h2 className="flex items-center gap-2 font-bold text-navy"><TriangleAlert className="size-4" /> Validações e conciliações</h2>
        {m.checks.length === 0 ? <p className="mt-2 text-sm text-tinta-suave">Nenhum alerta.</p> : (
          <ul className="mt-2 space-y-2">
            {m.checks.map((c) => <CheckItem key={c.key} month={p.month} c={c} justification={p.reconciliations[c.key] ?? ''} canEdit={perms.canEdit && c.level !== 'meta'} pending={pending} run={run} />)}
          </ul>
        )}
      </Card>

      <Card className="grid gap-3 p-4 md:grid-cols-2 [&>*]:min-w-0">
        <div>
          <Label>Observações do gestor</Label>
          <textarea className="mt-1 min-h-28 w-full rounded-lg border border-borda p-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!perms.canEdit} placeholder="Contexto do mês (eventos, chuvas, mudanças de preço…). Entra no relatório como contexto, não como dado." />
        </div>
        <div>
          <Label>Decisões dos sócios</Label>
          <textarea className="mt-1 min-h-28 w-full rounded-lg border border-borda p-2 text-sm" value={decisions} onChange={(e) => setDecisions(e.target.value)} disabled={!perms.canEdit} />
        </div>
        {perms.canEdit && <div className="md:col-span-2"><Button size="sm" disabled={pending} onClick={() => run(() => saveNotesAction(p.month, { managerNotes: notes, partnerDecisions: decisions }))}><Save /> Salvar observações</Button></div>}
      </Card>
    </div>
  );
}

function CheckItem({ month, c, justification, canEdit, pending, run }: { month: string; c: FinPeriodView['metrics']['checks'][number]; justification: string; canEdit: boolean; pending: boolean; run: RunFn }) {
  const [text, setText] = useState(justification);
  const tone = c.level === 'divergencia' ? 'red' : c.level === 'meta' ? 'blue' : 'amber';
  return (
    <li className="rounded-lg border border-borda p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{c.level}</Badge>
        <span className="min-w-0 flex-1">{c.message}</span>
        {justification && <Badge tone="green">justificado</Badge>}
      </div>
      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Input className="h-8 min-w-0 flex-1 text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="Justificativa (ex.: diferença é o estorno do dia 31)" />
          <Button size="sm" variant="secondary" disabled={pending || text === justification} onClick={() => run(() => saveReconciliationAction(month, c.key, text))}><Save /> Salvar</Button>
        </div>
      )}
      {!canEdit && justification && <p className="mt-1 text-xs text-tinta-suave">Justificativa: {justification}</p>}
    </li>
  );
}

// ── 4. Relatório ─────────────────────────────────────────────

function ReportTab({ p, perms, pending, run }: { p: FinPeriodView; perms: Perms; pending: boolean; run: RunFn }) {
  const [mode, setMode] = useState<ReportMode>('completo');
  const [generating, setGenerating] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="inline-flex rounded-lg border border-borda p-0.5">
          {(['completo', 'socios'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn('rounded-md px-3 py-1 text-sm font-semibold', mode === m ? 'bg-nacao text-white' : 'text-tinta-suave')}>{m === 'completo' ? 'Relatório completo' : 'Visão dos sócios'}</button>
          ))}
        </div>
        <span className="flex-1" />
        {perms.canEdit && (
          <Button size="sm" variant="secondary" disabled={pending || generating || !p.lines.length} onClick={() => { setGenerating(true); run(() => analysisAction(p.month), () => setGenerating(false)); }}>
            <Sparkles /> {generating && pending ? 'Escrevendo a análise…' : p.analysis ? 'Gerar a análise de novo' : 'Gerar análise (IA)'}
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => window.print()}><Printer /> Imprimir / PDF</Button>
      </div>
      {p.lines.some((l) => l.status === 'EXTRACTED') && <p className="rounded-lg border border-atencao/40 bg-atencao/5 p-2 text-sm print:hidden">Há dados ainda não conferidos — este relatório é uma prévia.</p>}
      <div>
        <ReportView month={p.month} m={p.metrics} analysis={p.analysis} previous={p.previous} managerNotes={p.managerNotes} partnerDecisions={p.partnerDecisions} mode={mode} version={p.status === 'APPROVED' ? p.version : null} />
      </div>
    </div>
  );
}

// ── Versões e aprovação ──────────────────────────────────────

function VersionsTab({ p }: { p: FinPeriodView }) {
  return (
    <Card className="divide-y divide-borda">
      {p.versions.length === 0 && <p className="p-4 text-sm text-tinta-suave">Ainda não aprovado. Cada aprovação congela os números e o relatório numa versão.</p>}
      {p.versions.map((v) => (
        <Link key={v.number} href={`/financeiro/competencias/${p.month}/versao/${v.number}`} className="flex flex-wrap items-center gap-2 p-3 text-sm hover:bg-fundo">
          <History className="size-4 text-tinta-fraca" />
          <b className="text-navy">Versão {v.number}</b>
          {v.number === p.version && <Badge tone="green">vigente</Badge>}
          <span className="text-tinta-suave">{new Date(v.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{v.createdBy ? ` · ${v.createdBy}` : ''}</span>
          {v.reason && <span className="min-w-0 flex-1 truncate italic text-tinta-suave">“{v.reason}”</span>}
        </Link>
      ))}
    </Card>
  );
}

function ApproveBar({ p, pendingLines, pending, run }: { p: FinPeriodView; pendingLines: number; pending: boolean; run: RunFn }) {
  const [reason, setReason] = useState('');
  if (p.status === 'APPROVED') return null;
  const next = p.version + 1;
  const blocked = pendingLines > 0 || p.lines.length === 0;
  return (
    <Card className="flex flex-wrap items-center gap-2 border-nacao/30 p-3 print:hidden">
      <div className="min-w-0 flex-1 text-sm">
        <b className="text-navy">Aprovar versão {next}</b>
        <p className="text-xs text-tinta-suave">{blocked ? (p.lines.length ? `Confira os ${pendingLines} dado(s) pendente(s) antes de aprovar.` : 'Envie e confira os documentos primeiro.') : 'Congela os números, os documentos e a análise. O painel e o histórico passam a usar esta versão.'}</p>
      </div>
      {p.version > 0 && <Input className="h-8 w-64 max-w-full text-xs" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo da nova versão (obrigatório)" />}
      <Button disabled={pending || blocked || (p.version > 0 && reason.trim().length < 3)} onClick={() => run(() => approveAction(p.month, reason || null), () => setReason(''))}>
        <CheckCircle2 /> Aprovar v{next}
      </Button>
    </Card>
  );
}
