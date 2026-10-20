'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Clock, Lock, MessageSquare, Plus, ShieldCheck, Sparkles, Trash2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Select } from '@/components/ui/input';
import { addDays } from '@/domain/dates';
import { APPROVAL_STATUSES, AREAS, CAMPAIGN_STATUSES, PRIORITIES, TASK_COLUMNS, isDone, labelOf } from '@/domain/marketing/constants';
import { cn } from '@/lib/cn';
import type { CampaignView, MktOptions } from '@/server/services/marketing-service';
import { addCampaignCommentAction, decideSuggestionAction, deleteCampaignAction, setCampaignStatusAction, suggestTasksAction } from '../../actions';
import { TaskSheet, type TaskDefaults } from '../../_components/TaskSheet';
import { AreaChip, CampaignStatusBadge, PriorityTag, ReadinessRing, fmtDate } from '../../_components/ui';
import { CampaignForm } from '../CampaignForm';

const TABS = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'tarefas', label: 'Tarefas' },
  { id: 'briefing', label: 'Briefing' },
  { id: 'historico', label: 'Histórico' },
] as const;
const SOON = ['Canais & links', 'Conteúdo', 'Resultados'];
type Tab = (typeof TABS)[number]['id'];
type Msg = { error?: string | null; ok?: string | null };

export function CampaignClient({ v, options, today, perms }: { v: CampaignView; options: MktOptions; today: string; perms: { edit: boolean; approve: boolean; ai: boolean } }) {
  const router = useRouter();
  const pendingSuggestion = v.suggestions.find((s) => s.status === 'PENDENTE');
  const [tab, setTab] = useState<Tab>(pendingSuggestion ? 'tarefas' : 'resumo');
  const [msg, setMsg] = useState<Msg>({});
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState<{ id: string | null; defaults?: TaskDefaults } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) => start(async () => {
    setMsg({});
    const r = await fn();
    if (!r.ok) return setMsg({ error: r.error });
    setMsg({ ok: r.message ?? null });
    after?.();
    router.refresh();
  });
  const siblings = v.tasks.map((t) => ({ id: t.id, title: t.title, campaignId: v.id }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ReadinessRing score={v.readiness.score} size={52} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold text-navy">{v.name}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
            <CampaignStatusBadge status={v.status} />
            <span>{fmtDate(v.data.startDate)}{v.data.endDate && v.data.endDate !== v.data.startDate ? ` – ${fmtDate(v.data.endDate)}` : ''}</span>
            {v.owner && <span>· {v.owner}</span>}
            {v.event && <span>· evento: {v.event.name}</span>}
          </p>
        </div>
        {perms.approve && !['ATIVA', 'FINALIZADA', 'ANALISE'].includes(v.status) && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm(`Excluir a campanha "${v.name}" e suas ${v.tasks.length} tarefas?`)) run(() => deleteCampaignAction(v.id), () => router.push('/marketing/campanhas')); }}><Trash2 /> Excluir</Button>
        )}
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-borda">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold', tab === t.id ? 'border-nacao text-nacao' : 'border-transparent text-tinta-suave hover:text-tinta')}>
            {t.label}{t.id === 'tarefas' ? ` (${v.tasks.length})` : ''}{t.id === 'tarefas' && pendingSuggestion ? ' ✨' : ''}
          </button>
        ))}
        {SOON.map((s) => <span key={s} className="whitespace-nowrap px-3 py-2 text-sm text-tinta-fraca" title="Fase 2">{s} <Badge className="ml-1">breve</Badge></span>)}
      </nav>
      <FormMessage error={msg.error} success={msg.ok} />

      {tab === 'resumo' && <Summary v={v} perms={perms} pending={pending} run={run} onCreateTask={(d) => setSheet({ id: null, defaults: d })} />}
      {tab === 'tarefas' && (
        <Tasks v={v} today={today} perms={perms} pending={pending} run={run} suggestion={pendingSuggestion}
          onOpen={(id) => setSheet({ id })} onNew={() => setSheet({ id: null, defaults: { campaignId: v.id } })} />
      )}
      {tab === 'briefing' && <CampaignForm id={v.id} initial={v.data} options={options} canEdit={perms.edit} />}
      {tab === 'historico' && <History v={v} pending={pending} run={run} />}
      {sheet && <TaskSheet taskId={sheet.id} defaults={sheet.defaults} options={options} siblings={siblings} canEdit={perms.edit} onClose={() => setSheet(null)} />}
    </div>
  );
}

type RunFn = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) => void;

function Summary({ v, perms, pending, run, onCreateTask }: { v: CampaignView; perms: { edit: boolean; approve: boolean }; pending: boolean; run: RunFn; onCreateTask: (d: TaskDefaults) => void }) {
  const idx = CAMPAIGN_STATUSES.findIndex((s) => s.id === v.status);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] [&>*]:min-w-0">
      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="flex items-center gap-2 font-bold text-navy"><ShieldCheck className="size-4" /> Marketing Readiness: {v.readiness.score}/100</h2>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {v.readiness.items.map((i) => (
              <li key={i.key} className="flex items-start gap-2 text-sm" title={i.ok ? '' : i.hint}>
                {i.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sucesso" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-critico" />}
                <span className={cn(!i.ok && 'font-semibold text-tinta')}>{i.label}{!i.ok && <span className="block text-xs font-normal text-tinta-suave">{i.hint}</span>}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <h2 className="flex items-center gap-2 font-bold text-navy"><Clock className="size-4" /> Antecedência {v.milestones.current && <Badge tone="blue">agora: {v.milestones.current}</Badge>}</h2>
          {v.milestones.next && <p className="text-xs text-tinta-suave">Próximo marco: {v.milestones.next.label} em {fmtDate(v.milestones.next.date)}</p>}
          {v.milestones.alerts.length === 0 ? <p className="mt-2 text-sm text-sucesso">Tudo em dia para os marcos já alcançados.</p> : (
            <ul className="mt-2 space-y-2">
              {v.milestones.alerts.map((a) => (
                <li key={a.milestone + a.key} className={cn('flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm', a.severity === 'critico' ? 'border-critico/30 bg-critico/5' : 'border-atencao/30 bg-atencao/5')}>
                  <Badge tone={a.severity === 'critico' ? 'red' : 'amber'}>{a.milestone}</Badge>
                  <span className="min-w-0 flex-1">{a.message}</span>
                  {perms.edit && a.suggestion && (
                    <Button size="sm" variant="secondary" onClick={() => onCreateTask({ campaignId: v.id, title: a.suggestion!.title, areaKey: a.suggestion!.area, dueDate: addDays(v.data.startDate, a.suggestion!.offset), origin: 'ANTECEDENCIA', milestone: a.milestone })}><Plus /> Criar tarefa</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="font-bold text-navy">Status</h2>
          <ol className="mt-2 space-y-1">
            {CAMPAIGN_STATUSES.map((s, i) => {
              const needsApprove = APPROVAL_STATUSES.includes(s.id);
              const can = perms.edit && s.id !== v.status && (!needsApprove || perms.approve);
              return (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <span className={cn('size-2.5 shrink-0 rounded-full', i < idx ? 'bg-nacao' : i === idx ? 'bg-ciano ring-4 ring-ciano/25' : 'bg-borda')} />
                  <span className={cn('flex-1', i === idx ? 'font-bold text-navy' : 'text-tinta-suave')}>{s.label}{needsApprove && <Lock className="ml-1 inline size-3 text-tinta-fraca" />}</span>
                  {can && <button disabled={pending} onClick={() => { if (s.id !== 'ATIVA' || confirm(`Ativar "${v.name}"?`)) run(() => setCampaignStatusAction(v.id, s.id)); }} className="text-xs font-semibold text-nacao hover:underline">mover</button>}
                </li>
              );
            })}
          </ol>
          {v.gate.length > 0 && (
            <p className="mt-3 flex gap-1.5 rounded-lg bg-atencao/10 p-2 text-xs text-atencao"><AlertTriangle className="size-4 shrink-0" /> Para ativar falta: {v.gate.join(', ')}.</p>
          )}
          {!perms.approve && <p className="mt-2 text-[11px] text-tinta-fraca"><Lock className="mr-1 inline size-3" />Programar e ativar exigem aprovação.</p>}
        </Card>

        <Card className="space-y-1.5 p-4 text-sm">
          <h2 className="font-bold text-navy">Em uma olhada</h2>
          {[['Objetivo', v.data.objective], ['Público', v.data.audience], ['Mensagem', v.data.message], ['CTA', v.data.cta], ['Oferta', v.data.offer], ['Lead', v.leadOwner], ['Meta', v.data.goal]].map(([k, val]) => (
            <p key={k}><span className="text-tinta-suave">{k}: </span>{val || <span className="italic text-tinta-fraca">não definido</span>}</p>
          ))}
        </Card>
      </div>
    </div>
  );
}

function Tasks({ v, today, perms, pending, run, suggestion, onOpen, onNew }: {
  v: CampaignView; today: string; perms: { edit: boolean; ai: boolean }; pending: boolean; run: RunFn; suggestion: CampaignView['suggestions'][number] | undefined; onOpen: (id: string) => void; onNew: () => void;
}) {
  const [thinking, setThinking] = useState(false);
  const groups: { key: string; name: string; color: string; tasks: CampaignView['tasks'] }[] = [
    ...AREAS.map((a) => ({ key: a.key as string, name: a.name as string, color: a.color as string, tasks: v.tasks.filter((t) => t.area?.key === a.key) })),
    { key: 'SEM', name: 'Sem área', color: '#7d8ea0', tasks: v.tasks.filter((t) => !t.area) },
  ].filter((g) => g.tasks.length);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-tinta-suave">{v.tasks.filter((t) => isDone(t.column)).length}/{v.tasks.length} concluídas · {v.tasks.filter((t) => t.dueDate && t.dueDate < today && !isDone(t.column)).length} atrasada(s)</p>
        {perms.edit && <Button size="sm" variant="secondary" onClick={onNew}><Plus /> Tarefa</Button>}
        {perms.ai && perms.edit && !suggestion && (
          <Button size="sm" disabled={pending} onClick={() => { setThinking(true); run(() => suggestTasksAction(v.id), () => setThinking(false)); }}>
            <Sparkles /> {thinking && pending ? 'A IA está montando o plano…' : 'Sugerir tarefas (IA)'}
          </Button>
        )}
      </div>
      {suggestion && <SuggestionReview v={v} s={suggestion} today={today} pending={pending} run={run} canEdit={perms.edit} />}
      {groups.length === 0 && !suggestion && <Card className="p-6 text-center text-sm text-tinta-suave">Nenhuma tarefa ainda. Use <b>Sugerir tarefas (IA)</b> para montar o plano a partir do briefing.</Card>}
      {groups.map((g) => (
        <Card key={g.key} className="overflow-hidden">
          <p className="flex items-center gap-2 bg-fundo px-3 py-2 text-sm font-bold text-navy"><span className="size-2.5 rounded-full" style={{ background: g.color }} />{g.name} <span className="font-normal text-tinta-fraca">({g.tasks.filter((t) => isDone(t.column)).length}/{g.tasks.length})</span></p>
          <ul className="divide-y divide-borda">
            {g.tasks.map((t) => {
              const late = t.dueDate && t.dueDate < today && !isDone(t.column);
              return (
                <li key={t.id}>
                  <button onClick={() => onOpen(t.id)} className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm hover:bg-fundo">
                    {isDone(t.column) ? <CheckCircle2 className="size-4 text-sucesso" /> : <span className="size-4 rounded-full border-2 border-borda" />}
                    <span className={cn('min-w-0 flex-1', isDone(t.column) && 'text-tinta-fraca line-through')}>{t.title}</span>
                    <PriorityTag p={t.priority} />
                    {t.origin === 'IA' && <Sparkles className="size-3 text-ciano" aria-label="sugerida pela IA" />}
                    <Badge>{t.columnName ?? labelOf(TASK_COLUMNS, t.column)}</Badge>
                    <span className={cn('w-12 text-right text-xs tabular-nums', late ? 'font-bold text-critico' : 'text-tinta-suave')}>{fmtDate(t.dueDate)}</span>
                    <span className="w-28 truncate text-right text-xs text-tinta-suave">{t.assignee ?? '—'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}

/** Revisão humana das tarefas sugeridas pela IA: aceitar todas, algumas, editar ou descartar. */
function SuggestionReview({ v, s, today, pending, run, canEdit }: { v: CampaignView; s: CampaignView['suggestions'][number]; today: string; pending: boolean; run: RunFn; canEdit: boolean }) {
  const items = s.payload.tarefas;
  const due0 = (off: number) => { const d = addDays(v.data.startDate, off); return d < today ? today : d; };
  const [rows, setRows] = useState(items.map((t) => ({ accept: true, title: t.titulo, area: t.area, dueDate: due0(t.offsetDias), priority: t.prioridade })));
  const selected = rows.filter((r) => r.accept).length;
  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const byArea = useMemo(() => AREAS.map((a) => ({ ...a, idx: items.map((t, i) => (t.area === a.key ? i : -1)).filter((i) => i >= 0) })).filter((g) => g.idx.length), [items]);
  const submit = (all?: boolean | 'none') => {
    const decisions = rows.map((r, i) => ({ index: i, accept: all === 'none' ? false : all ? true : r.accept, title: r.title, area: r.area, dueDate: r.dueDate, priority: r.priority }));
    if (all === 'none' && !confirm('Descartar todas as sugestões?')) return;
    run(() => decideSuggestionAction(s.id, decisions));
  };
  return (
    <Card className="border-ciano/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-2 font-bold text-navy"><Sparkles className="size-4 text-ciano" /> A IA sugeriu {items.length} tarefas <span className="text-xs font-normal text-tinta-suave">({s.model ?? 'IA'} · {s.promptVersion})</span></p>
      </div>
      {s.payload.observacoes && <p className="mt-1 rounded-lg bg-atencao/10 px-3 py-2 text-xs text-atencao">{s.payload.observacoes}</p>}
      <p className="mt-2 text-xs text-tinta-suave">Nada é criado sem o seu aceite. Desmarque o que não quiser e ajuste título, área, prazo e prioridade.</p>
      <div className="mt-3 space-y-3">
        {byArea.map((g) => (
          <div key={g.key}>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-navy"><span className="size-2 rounded-full" style={{ background: g.color }} />{g.name}</p>
            <ul className="space-y-1">
              {g.idx.map((i) => (
                <li key={i} className={cn('grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 py-1 sm:grid-cols-[auto_minmax(0,1fr)_9rem_8.5rem_7rem]', rows[i]!.accept ? 'bg-fundo' : 'opacity-50')}>
                  <input type="checkbox" checked={rows[i]!.accept} onChange={(e) => setRow(i, { accept: e.target.checked })} aria-label={`Aceitar ${rows[i]!.title}`} />
                  <Input className="h-8 text-sm" value={rows[i]!.title} onChange={(e) => setRow(i, { title: e.target.value })} title={items[i]!.descricao} />
                  <Select className="col-start-2 h-8 text-xs sm:col-start-auto" value={rows[i]!.area} onChange={(e) => setRow(i, { area: e.target.value as typeof rows[number]['area'] })}>{AREAS.map((a) => <option key={a.key} value={a.key}>{a.name.split(' ')[0]}</option>)}</Select>
                  <Input type="date" className="col-start-2 h-8 text-xs sm:col-start-auto" value={rows[i]!.dueDate} onChange={(e) => setRow(i, { dueDate: e.target.value })} />
                  <Select className="col-start-2 h-8 text-xs sm:col-start-auto" value={rows[i]!.priority} onChange={(e) => setRow(i, { priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={pending || !selected} onClick={() => submit()}><CheckCircle2 /> Aceitar selecionadas ({selected})</Button>
          <Button variant="secondary" disabled={pending} onClick={() => submit(true)}>Aceitar todas</Button>
          <Button variant="ghost" disabled={pending} onClick={() => submit('none')}><XCircle /> Descartar</Button>
        </div>
      )}
    </Card>
  );
}

function History({ v, pending, run }: { v: CampaignView; pending: boolean; run: RunFn }) {
  const [text, setText] = useState('');
  return (
    <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <Card className="p-4">
        <h2 className="flex items-center gap-2 font-bold text-navy"><MessageSquare className="size-4" /> Comentários</h2>
        <ul className="mt-2 space-y-2">
          {v.comments.length === 0 && <li className="text-sm text-tinta-suave">Sem comentários.</li>}
          {v.comments.map((c) => <li key={c.id} className="text-sm"><p className="text-[11px] text-tinta-fraca">{c.author ?? '—'} · {new Date(c.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p><p className="whitespace-pre-line">{c.body}</p></li>)}
        </ul>
        <div className="mt-3 flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva um comentário" />
          <Button size="sm" variant="secondary" disabled={pending || !text.trim()} onClick={() => run(() => addCampaignCommentAction(v.id, text), () => setText(''))}><Plus /></Button>
        </div>
      </Card>
      <Card className="p-4">
        <h2 className="font-bold text-navy">Histórico (auditoria)</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {v.history.map((h, i) => <li key={i} className="flex gap-2"><span className="w-28 shrink-0 text-xs tabular-nums text-tinta-fraca">{new Date(h.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span><span className="min-w-0">{h.summary}</span></li>)}
        </ul>
        <Link href="/admin/historico" className="mt-2 inline-block text-xs font-semibold text-nacao hover:underline">Histórico completo do sistema →</Link>
      </Card>
    </div>
  );
}

