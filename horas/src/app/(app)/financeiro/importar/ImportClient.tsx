'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, CheckCircle2, FileUp, GitBranch, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label } from '@/components/ui/input';
import { isMonth, monthLabel, monthTitle } from '@/domain/condominio/months';
import { compareMetrics, type Metrics } from '@/domain/financeiro/metrics';
import { DATASETS } from '@/domain/financeiro/taxonomy';
import type { HistoricAnalysis } from '@/server/services/fin-service';
import { fmtValue, FIN_STATUS } from '../_components/fmt';
import { LineForm, keyLabel, lineValue, type CategoryOption, type LineDraft } from '../_components/lines';
import { analyzeHistoricAction, commitHistoricAction, discardHistoricAction, previewHistoricAction } from '../actions';

const ACCEPT = '.pdf,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.docx,.txt,.md,.html,.htm';
type Draft = LineDraft & { uid: number; sourceRef?: string | null; sourceValue?: string | null; rule?: string | null };
let uid = 0;

export function ImportClient({ periods, approved, categories, canApprove }: {
  periods: { month: string; status: string; version: number }[]; approved: Record<string, Metrics>; categories: CategoryOption[]; canApprove: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [a, setA] = useState<HistoricAnalysis | null>(null);
  const [month, setMonth] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [compare, setCompare] = useState<ReturnType<typeof compareMetrics> | null>(null);
  const [msg, setMsg] = useState<{ error?: string | null; ok?: string | null }>({});
  const [pending, start] = useTransition();

  const existing = periods.find((p) => p.month === month) ?? null;
  const reset = () => { setA(null); setLines([]); setMonth(''); setNotes(''); setCompare(null); setEditing(null); };

  const upload = (file: File) => start(async () => {
    setMsg({});
    const fd = new FormData();
    fd.set('file', file);
    const r = await analyzeHistoricAction(fd);
    if (!r.ok) return setMsg({ error: r.error });
    setA(r.data);
    setMonth(r.data.month ?? '');
    setNotes(r.data.notes ?? '');
    setLines(r.data.lines.map((l) => ({ ...l, uid: ++uid })));
    setCompare(null);
  });
  const payload = () => lines.map(({ uid: _u, ...l }) => l);
  const commit = (mode: 'novo' | 'versao' | 'atualizar') => start(async () => {
    setMsg({});
    const r = await commitHistoricAction({ documentId: a!.documentId, month, mode, notes: notes || null, lines: payload() });
    if (!r.ok) return setMsg({ error: r.error });
    reset();
    router.push(`/financeiro/competencias/${r.data.month}`);
  });
  const doCompare = () => start(async () => {
    setMsg({});
    const r = await previewHistoricAction(payload());
    if (!r.ok) return setMsg({ error: r.error });
    const base = approved[month];
    if (!base) return setMsg({ error: `${monthLabel(month as `${number}-${string}`)} ainda não tem versão aprovada para comparar.` });
    setCompare(compareMetrics(base, r.data));
  });
  const cancel = () => start(async () => { if (a) await discardHistoricAction(a.documentId); reset(); setMsg({ ok: 'Importação cancelada. Nada foi gravado.' }); });

  if (!a) {
    return (
      <Card className="p-6 text-center">
        <input ref={ref} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
        <FileUp className="mx-auto size-8 text-nacao" />
        <p className="mt-2 font-bold text-navy">Envie um relatório financeiro antigo</p>
        <p className="text-sm text-tinta-suave">Um mês por arquivo, até 6 MB. A leitura leva de 30 segundos a 2 minutos.</p>
        <Button className="mt-3" disabled={pending} onClick={() => ref.current?.click()}><FileUp /> {pending ? 'Lendo o relatório…' : 'Escolher arquivo'}</Button>
        <div className="mt-2 text-left"><FormMessage error={msg.error} success={msg.ok} /></div>
      </Card>
    );
  }

  const groups = DATASETS.map((d) => ({ ...d, lines: lines.filter((l) => l.dataset === d.id) })).filter((g) => g.lines.length);
  const validMonth = isMonth(month);
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <p className="font-bold text-navy">Encontramos os seguintes dados</p>
        <p className="text-sm text-tinta-suave">Arquivo: {a.filename}{a.identified ? ` · lido como: ${a.identified}` : ''}. Confira e corrija antes de confirmar.</p>
        {a.warnings.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-atencao">{a.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_1fr] [&>*]:min-w-0">
          <div><Label>Mês do relatório</Label><Input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setCompare(null); }} />{!a.month && <p className="mt-1 text-xs text-atencao">Não identificamos o mês — informe.</p>}</div>
          <div><Label>Observações encontradas (vão como contexto do gestor)</Label><textarea className="min-h-16 w-full rounded-lg border border-borda p-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-tinta-suave">{lines.length} dado(s). Linhas de “Indicadores de relatório anterior” só entram quando o relatório não traz o detalhe.</p>
        <Button size="sm" variant="secondary" onClick={() => setEditing('new')}><Plus /> Incluir dado</Button>
      </div>
      {editing === 'new' && (
        <LineForm initial={{ dataset: 'INDICADOR', key: null, label: '', unit: null, amountCents: null, quantity: null, classification: null, meta: null }} categories={categories} submitLabel="Incluir"
          onCancel={() => setEditing(null)} onSave={(l) => { setLines((x) => [...x, { ...l, uid: ++uid, rule: 'Incluído na conferência da importação' }]); setEditing(null); setCompare(null); }} />
      )}
      {groups.map((g) => (
        <Card key={g.id} className="overflow-hidden">
          <div className="border-b border-borda bg-fundo px-3 py-2 text-sm font-bold text-navy">{g.label}</div>
          <ul className="divide-y divide-borda">
            {g.lines.map((l) => (
              <li key={l.uid} className="p-2 text-sm">
                {editing === l.uid ? (
                  <LineForm initial={l} categories={categories} onCancel={() => setEditing(null)}
                    onSave={(v) => { setLines((x) => x.map((y) => (y.uid === l.uid ? { ...y, ...v } : y))); setEditing(null); setCompare(null); }} />
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{l.label}{l.unit ? <span className="font-normal text-tinta-suave"> · {l.unit}</span> : null}</p>
                      <p className="truncate text-xs text-tinta-suave">{keyLabel(l.dataset, l.key, categories) ?? <span className="text-atencao">sem categoria</span>}{l.sourceRef ? ` · ${l.sourceRef}` : ''}</p>
                    </div>
                    <span className="font-bold tabular-nums text-navy">{lineValue(l)}</span>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(l.uid)} aria-label="Editar"><Pencil /></Button>
                    <Button variant="ghost" size="sm" onClick={() => { setLines((x) => x.filter((y) => y.uid !== l.uid)); setCompare(null); }} aria-label="Remover"><Trash2 /></Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {compare && (
        <Card className="overflow-x-auto p-4">
          <p className="mb-2 font-bold text-navy">Comparação: versão aprovada × relatório importado</p>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-borda text-left text-xs text-tinta-suave"><th className="py-1 pr-3">Indicador</th><th className="py-1 pr-3 text-right">No sistema</th><th className="py-1 pr-3 text-right">Importado</th><th className="py-1 text-right">Diferença</th></tr></thead>
            <tbody>{compare.map((r) => <tr key={r.key} className="border-b border-borda/60"><td className="py-1 pr-3">{r.label}</td><td className="py-1 pr-3 text-right tabular-nums">{fmtValue(r.a, r.unit)}</td><td className="py-1 pr-3 text-right tabular-nums">{fmtValue(r.b, r.unit)}</td><td className="py-1 text-right tabular-nums">{r.delta === null ? '—' : r.delta === 0 ? 'igual' : fmtValue(r.delta, r.unit)}</td></tr>)}</tbody>
          </table>
        </Card>
      )}

      <Card className="space-y-2 border-nacao/30 p-4">
        {!validMonth ? <p className="text-sm text-atencao">Informe o mês do relatório.</p> : existing ? (
          <>
            <p className="text-sm">
              <b className="text-navy">Já existe um relatório de {monthTitle(month as `${number}-${string}`)}</b>{' '}
              <Badge tone={FIN_STATUS[existing.status]?.tone}>{FIN_STATUS[existing.status]?.label}</Badge>{existing.version > 0 && <Badge tone="navy" className="ml-1">v{existing.version}</Badge>}
              {' '}<Link href={`/financeiro/competencias/${month}`} className="text-nacao hover:underline">abrir</Link>. Nada será sobrescrito — escolha:
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={pending || !approved[month]} onClick={doCompare}><ArrowLeftRight /> Comparar</Button>
              <Button disabled={pending || !canApprove || !lines.length} onClick={() => { if (confirm(`Criar a versão ${existing.version + 1} de ${monthLabel(month as `${number}-${string}`)} com estes dados? As versões anteriores ficam guardadas.`)) commit('versao'); }}><GitBranch /> Criar nova versão</Button>
              <Button variant="secondary" disabled={pending || !lines.length} onClick={() => commit('atualizar')}><RefreshCw /> Atualizar dados (vai para conferência)</Button>
              <Button variant="ghost" disabled={pending} onClick={cancel}><X /> Cancelar</Button>
            </div>
            {!canApprove && <p className="text-xs text-tinta-suave">Criar nova versão exige permissão de aprovação.</p>}
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-sm">Grava {monthTitle(month as `${number}-${string}`)} como relatório aprovado (versão 1), com o arquivo original guardado.</p>
            <Button disabled={pending || !canApprove || !lines.length} onClick={() => commit('novo')}><CheckCircle2 /> {pending ? 'Gravando…' : 'Confirmar e gravar'}</Button>
            <Button variant="ghost" disabled={pending} onClick={cancel}><X /> Cancelar</Button>
            {!canApprove && <p className="w-full text-xs text-tinta-suave">Gravar como aprovado exige permissão de aprovação.</p>}
          </div>
        )}
        <FormMessage error={msg.error} success={msg.ok} />
      </Card>
    </div>
  );
}
