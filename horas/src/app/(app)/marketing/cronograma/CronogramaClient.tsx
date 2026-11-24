'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardCopy, ClipboardPaste, KanbanSquare, Lock, Pencil, Plus, Sparkles, Trash2, Unlock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { CHANNELS, FORMATS, POST_STATUSES, channelLabel, dayHeader, formatLabel, monthDays, monthLabel, shiftMonth } from '@/domain/marketing/cronograma';
import { cn } from '@/lib/cn';
import type { CronogramaView } from '@/server/services/mkt-cronograma-service';
import { useRun } from '../_components/useRun';
import {
  approvePlanAction, cronogramaTextAction, deletePostAction, generatePlanAction, importPlanTextAction, markPostAction,
  postToTaskAction, reopenPlanAction, savePlanInfoAction, savePostAction,
} from '../cronograma-actions';

type Post = CronogramaView['posts'][number];
type Can = { edit: boolean; ai: boolean; approve: boolean };
const area = 'min-h-[80px] w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm text-tinta focus:border-nacao focus:outline-none focus:ring-2 focus:ring-nacao/20 disabled:bg-fundo';
const COLUMN_LABEL: Record<string, string> = { BACKLOG: 'backlog', PROXIMAS: 'próximas', SEMANA: 'na semana', PRODUCAO: 'em produção', APROVACAO: 'em aprovação', PROGRAMADO: 'programado', EXECUTADO: 'publicado', RESULTADOS: 'resultados' };

export function CronogramaClient({ view, today, can }: { view: CronogramaView; today: string; can: Can }) {
  const { msg, setMsg, pending, run } = useRun();
  const approved = view.plan?.status === 'APROVADO';
  const editable = can.edit && !approved;
  const [paste, setPaste] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of view.posts) m.set(p.date, [...(m.get(p.date) ?? []), p]);
    return m;
  }, [view.posts]);
  const free = monthDays(view.month).filter((d) => !byDay.has(d)).length;
  const topics = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of view.posts) if (p.format !== 'STORIES') m.set(p.topic, (m.get(p.topic) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [view.posts]);
  const pendings = view.posts.filter((p) => p.pending).length;
  const withTask = view.posts.filter((p) => p.taskId).length;

  const copyText = () => run(() => cronogramaTextAction(view.month), (r) => {
    const t = (r as { data: string }).data;
    setText(t);
    navigator.clipboard?.writeText(t).then(() => setMsg({ ok: 'Copiado no formato do Docs. É só colar no Google Docs.' }), () => setMsg({ ok: 'Texto pronto abaixo: selecione e copie.' }));
  });

  return (
    <div className="space-y-4">
      {/* Barra do mês */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Link href={`?mes=${shiftMonth(view.month, -1)}`} className="rounded-lg p-2 hover:bg-fundo" aria-label="Mês anterior"><ChevronLeft className="size-4" /></Link>
        <div className="min-w-40 text-center text-lg font-extrabold capitalize text-navy">{monthLabel(view.month)}</div>
        <Link href={`?mes=${shiftMonth(view.month, 1)}`} className="rounded-lg p-2 hover:bg-fundo" aria-label="Próximo mês"><ChevronRight className="size-4" /></Link>
        {approved
          ? <Badge tone="green"><Lock className="size-3" /> Aprovado{view.plan?.approvedBy ? ` por ${view.plan.approvedBy}` : ''}</Badge>
          : <Badge tone="amber">{view.plan ? 'Rascunho' : 'Ainda não começou'}</Badge>}
        <span className="text-xs text-tinta-suave">{view.posts.length} posts · {free} dias livres{pendings ? ` · ${pendings} a confirmar` : ''}{withTask ? ` · ${withTask} no Kanban` : ''}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {editable && can.ai && free > 0 && (
            <Button size="sm" disabled={pending} onClick={() => {
              setStep(`A IA está montando ${free} dias… (1–3 min)`);
              run(() => generatePlanAction(view.month), (r) => { setStep(null); const d = (r as { data: { created: number; note: string } }).data; setMsg({ ok: `${d.created} posts sugeridos. ${d.note}` }); });
            }}><Sparkles /> Sugerir com IA ({free} dias livres)</Button>
          )}
          {editable && <Button size="sm" variant="secondary" onClick={() => setPaste(paste === null ? '' : null)}><ClipboardPaste /> Colar do Docs</Button>}
          <Button size="sm" variant="secondary" disabled={pending || !view.posts.length} onClick={copyText}><ClipboardCopy /> Copiar no formato do Docs</Button>
          {!approved && can.approve && view.posts.length > 0 && (
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => {
              const msgPend = pendings ? `\n\nAinda há ${pendings} post(s) com itens a confirmar.` : '';
              if (confirm(`Aprovar o cronograma de ${monthLabel(view.month)}? A edição fica travada (dá para reabrir com motivo).${msgPend}`)) run(() => approvePlanAction(view.month));
            }}><Check /> Aprovar mês</Button>
          )}
          {approved && can.edit && (
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => {
              const reason = prompt('Motivo para reabrir o cronograma (vai para o histórico):');
              if (reason) run(() => reopenPlanAction(view.month, reason));
            }}><Unlock /> Reabrir para edição</Button>
          )}
        </div>
      </Card>
      {step && <p className="text-sm text-tinta-suave">{step}</p>}
      <FormMessage error={msg.error} success={msg.ok} />

      {paste !== null && (
        <Card className="space-y-2 p-4">
          <Label>Cole aqui o cronograma do Google Docs (dias no formato “01/12, TERÇA”). Os dias entram como estão; título repetido no mesmo dia não duplica.</Label>
          <textarea className={cn(area, 'min-h-[200px] font-mono text-xs')} value={paste} onChange={(e) => setPaste(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || !paste.trim()} onClick={() => run(() => importPlanTextAction(view.month, paste), (r) => {
              const d = (r as { data: { created: number; repeated: number; skipped: number } }).data;
              setPaste(null);
              setMsg({ ok: `${d.created} posts entraram no cronograma${d.repeated ? ` (${d.repeated} já estavam)` : ''}${d.skipped ? ` · ${d.skipped} linha(s) sem dia ignoradas` : ''}.` });
            })}>Trazer para o cronograma</Button>
            <Button size="sm" variant="ghost" onClick={() => setPaste(null)}>Cancelar</Button>
          </div>
        </Card>
      )}

      {text !== null && (
        <Card className="space-y-2 p-4">
          <div className="flex items-center justify-between"><Label>Texto no formato do Docs</Label><Button size="sm" variant="ghost" onClick={() => setText(null)}>Fechar</Button></div>
          <textarea readOnly className={cn(area, 'min-h-[260px] font-mono text-xs')} value={text} onFocus={(e) => e.currentTarget.select()} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="order-2 space-y-3 lg:order-1">
          {monthDays(view.month).map((d) => (
            <Day key={d} date={d} posts={byDay.get(d) ?? []} view={view} editable={editable} canEdit={can.edit} approved={approved} today={today} />
          ))}
        </div>
        <div className="order-1 space-y-4 lg:order-2">
          <Objectives key={`${view.plan?.objectives ?? ''}|${view.plan?.ownerId ?? ''}|${editable}`} view={view} editable={editable} />
          {topics.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-bold text-navy">Assuntos no mês</h3>
              <div className="flex flex-wrap gap-1.5">{topics.map(([t, n]) => <Badge key={t} tone="blue">{t} · {n}</Badge>)}</div>
            </Card>
          )}
          <MonthContext view={view} />
        </div>
      </div>
    </div>
  );
}

function Objectives({ view, editable }: { view: CronogramaView; editable: boolean }) {
  const { msg, pending, run } = useRun();
  const [objectives, setObjectives] = useState(view.plan?.objectives ?? '');
  const [ownerId, setOwnerId] = useState(view.plan?.ownerId ?? '');
  return (
    <Card className="space-y-2 p-4">
      <h3 className="text-sm font-bold text-navy">Objetivos do mês</h3>
      <p className="text-xs text-tinta-suave">É o que guia a IA: campanhas de venda, assuntos a reforçar, eventos e avisos.</p>
      <textarea className={cn(area, 'min-h-[160px]')} value={objectives} disabled={!editable} onChange={(e) => setObjectives(e.target.value)}
        placeholder={'ex.:\n- Plano Duo: upgrade com 10% OFF para quem veio da Black\n- Mais conteúdo de Tênis e Hyrox\n- Fim de ano: horários, recessos, eventos de CrossFit'} />
      <div>
        <Label>Responsável padrão das tarefas no Kanban</Label>
        <Select value={ownerId} disabled={!editable} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">— responsável da área —</option>
          {view.people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </div>
      {editable && <Button size="sm" disabled={pending} onClick={() => run(() => savePlanInfoAction(view.month, { objectives: objectives || null, ownerId: ownerId || null }))}>Salvar objetivos</Button>}
      <FormMessage error={msg.error} success={msg.ok} />
    </Card>
  );
}

function MonthContext({ view }: { view: CronogramaView }) {
  const rows = [
    ...view.holidays.map((h) => ({ k: `h${h.date}`, d: h.date, label: h.name, tag: 'Feriado', tone: 'amber' as const })),
    ...view.events.map((e) => ({ k: `e${e.id}`, d: e.start, label: e.name, tag: 'Evento', tone: 'navy' as const })),
    ...view.campaigns.map((c) => ({ k: `c${c.id}`, d: c.start, label: `${c.name}${c.end ? ` (até ${c.end.slice(8, 10)}/${c.end.slice(5, 7)})` : ''}`, tag: 'Campanha', tone: 'blue' as const })),
    ...view.items.map((i) => ({ k: `i${i.id}`, d: i.start, label: `${i.title}${i.end && i.end !== i.start ? ` (até ${i.end.slice(8, 10)}/${i.end.slice(5, 7)})` : ''}`, tag: i.kind === 'AVISO' ? 'Aviso' : 'Data', tone: 'cyan' as const })),
  ].sort((a, b) => a.d.localeCompare(b.d));
  return (
    <Card className="p-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-navy"><CalendarDays className="size-4" /> No calendário da Nação</h3>
      <p className="mb-2 text-xs text-tinta-suave">O que já está cadastrado em Eventos, Campanhas e Calendário. A IA usa isto; para mudar, altere lá.</p>
      {rows.length === 0 ? <p className="text-xs text-tinta-suave">Nada cadastrado para este mês.</p> : (
        <ul className="space-y-1.5 text-xs">
          {rows.map((r) => (
            <li key={r.k} className="flex gap-2"><span className="w-10 shrink-0 font-semibold text-tinta-suave">{r.d < `${view.month}-01` ? 'antes' : `${r.d.slice(8, 10)}/${r.d.slice(5, 7)}`}</span><Badge tone={r.tone}>{r.tag}</Badge><span className="text-tinta">{r.label}</span></li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Day({ date, posts, view, editable, canEdit, approved, today }: { date: string; posts: Post[]; view: CronogramaView; editable: boolean; canEdit: boolean; approved: boolean; today: string }) {
  const [adding, setAdding] = useState(false);
  const marks = [
    ...view.holidays.filter((h) => h.date === date).map((h) => h.name),
    ...view.events.filter((e) => e.start <= date && (e.end ?? e.start) >= date).map((e) => e.name),
    ...view.items.filter((i) => i.start === date).map((i) => i.title),
  ];
  const weekend = /SÁBADO|DOMINGO/.test(dayHeader(date as never));
  return (
    <div className={cn('rounded-xl border bg-white p-3', date === today ? 'border-nacao' : 'border-borda')}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={cn('text-sm font-extrabold', weekend ? 'text-tinta-suave' : 'text-navy')}>{dayHeader(date as never)}</span>
        {marks.map((m) => <Badge key={m} tone="cyan">{m}</Badge>)}
        {editable && <button className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-nacao hover:underline" onClick={() => setAdding(true)}><Plus className="size-3" /> post</button>}
      </div>
      {posts.length === 0 && !adding && <p className="text-xs text-tinta-fraca">Sem post planejado.</p>}
      <div className="space-y-2">
        {posts.map((p) => <PostCard key={p.id} post={p} view={view} editable={editable} canEdit={canEdit} approved={approved} />)}
        {adding && <PostForm view={view} date={date} onDone={() => setAdding(false)} />}
      </div>
    </div>
  );
}

function PostCard({ post, view, editable, canEdit, approved }: { post: Post; view: CronogramaView; editable: boolean; canEdit: boolean; approved: boolean }) {
  const { msg, pending, run } = useRun();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState(view.plan?.ownerId ?? '');
  const [views, setViews] = useState(post.views?.toString() ?? '');
  if (editing) return <PostForm view={view} date={post.date} post={post} onDone={() => setEditing(false)} />;
  const campaign = view.campaigns.find((c) => c.id === post.campaignId);
  const event = view.events.find((e) => e.id === post.eventId);
  const long = (post.body ?? '').split('\n').length > 4 || (post.body ?? '').length > 280;
  return (
    <div className={cn('rounded-lg border p-3', post.status === 'PUBLICADO' ? 'border-sucesso/40 bg-sucesso/5' : post.status === 'NAO_PUBLICADO' ? 'border-borda bg-fundo opacity-70' : 'border-borda')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="navy">{post.topic}</Badge>
        <Badge>{formatLabel(post.format)}</Badge>
        {post.channel !== 'INSTAGRAM' && <Badge tone="cyan">{channelLabel(post.channel)}</Badge>}
        {post.origin === 'IA' && <Badge tone="blue"><Sparkles className="size-3" /> IA</Badge>}
        {campaign && <Badge tone="blue">Campanha: {campaign.name}</Badge>}
        {event && <Badge tone="blue">Evento: {event.name}</Badge>}
        {editable && (
          <span className="ml-auto flex gap-1">
            <button className="rounded p-1 text-tinta-suave hover:bg-fundo" title="Editar" onClick={() => setEditing(true)}><Pencil className="size-3.5" /></button>
            <button className="rounded p-1 text-tinta-suave hover:bg-fundo hover:text-critico" title="Tirar do cronograma" disabled={pending}
              onClick={() => { if (confirm(`Tirar "${post.title}" do cronograma?${post.taskId ? ' A tarefa do Kanban continua.' : ''}`)) run(() => deletePostAction(view.month, post.id)); }}><Trash2 className="size-3.5" /></button>
          </span>
        )}
      </div>
      {post.format !== 'STORIES' && <p className="mt-1.5 font-bold text-tinta">“{post.title}”</p>}
      {post.body && <p className={cn('mt-1 whitespace-pre-line text-sm text-tinta-suave', !open && long && 'line-clamp-4')}>{post.body}</p>}
      {long && <button className="text-xs font-semibold text-nacao hover:underline" onClick={() => setOpen(!open)}>{open ? 'ver menos' : 'ver tudo'}</button>}
      {post.cta && <p className="mt-1 text-sm"><span className="font-semibold">CTA:</span> {post.cta}</p>}
      {post.stories && <p className="mt-0.5 text-sm"><span className="font-semibold">Stories:</span> {post.stories}</p>}
      {post.pending && <p className="mt-1 rounded bg-atencao/10 px-2 py-1 text-xs text-atencao">☐ A confirmar: {post.pending}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-borda pt-2 text-xs">
        {post.taskId ? (
          <Link href={`/marketing/kanban?tarefa=${post.taskId}`} className="inline-flex items-center gap-1 font-semibold text-nacao hover:underline">
            <KanbanSquare className="size-3.5" /> No Kanban{post.task ? ` · ${COLUMN_LABEL[post.task.column] ?? post.task.column.toLowerCase()}${post.task.assignee ? ` · ${post.task.assignee}` : ''}` : ' (tarefa removida)'}
          </Link>
        ) : canEdit && post.format !== 'STORIES' ? (
          <>
            <Select className="h-8 w-auto text-xs" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">— responsável da área —</option>
              {view.people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => postToTaskAction(post.id, assignee || null))}><KanbanSquare /> Mandar para o Kanban</Button>
          </>
        ) : post.format !== 'STORIES' ? <span className="text-tinta-fraca">Só orientação</span> : null}
        {approved && canEdit && (
          <span className="ml-auto flex items-center gap-1">
            <Select className="h-8 w-auto text-xs" value={post.status} disabled={pending}
              onChange={(e) => run(() => markPostAction(post.id, { status: e.target.value, views: views ? Number(views) : null }))}>
              {POST_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
            <Input className="h-8 w-24 text-xs" inputMode="numeric" placeholder="views" value={views} onChange={(e) => setViews(e.target.value.replace(/\D/g, ''))}
              onBlur={() => { if ((views || null) !== (post.views?.toString() ?? null)) run(() => markPostAction(post.id, { status: post.status, views: views ? Number(views) : null })); }} />
          </span>
        )}
      </div>
      <FormMessage error={msg.error} success={msg.ok} />
    </div>
  );
}

function PostForm({ view, date, post, onDone }: { view: CronogramaView; date: string; post?: Post; onDone: () => void }) {
  const { msg, pending, run } = useRun();
  const [f, setF] = useState({
    date: post?.date ?? date, channel: post?.channel ?? 'INSTAGRAM', topic: post?.topic ?? '', format: post?.format ?? 'REELS', title: post?.title ?? '',
    body: post?.body ?? '', cta: post?.cta ?? '', stories: post?.stories ?? '', pending: post?.pending ?? '', campaignId: post?.campaignId ?? '', eventId: post?.eventId ?? '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-2 rounded-lg border border-nacao/40 bg-nacao/5 p-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <div><Label>Dia</Label><Input type="date" min={`${view.month}-01`} max={view.range.to} value={f.date} onChange={set('date')} /></div>
        <div><Label>Assunto</Label><Input value={f.topic} onChange={set('topic')} placeholder="PLANO DUO" /></div>
        <div><Label>Formato</Label><Select value={f.format} onChange={set('format')}>{FORMATS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></div>
        <div><Label>Canal</Label><Select value={f.channel} onChange={set('channel')}>{CHANNELS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></div>
      </div>
      <div><Label>Título / gancho</Label><Input value={f.title} onChange={set('title')} placeholder="Duas modalidades. Um plano." /></div>
      <div><Label>Roteiro / slides / texto</Label><textarea className={cn(area, 'min-h-[120px]')} value={f.body} onChange={set('body')} placeholder={'Slide 1: …\nSlide 2: …'} /></div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><Label>CTA</Label><Input value={f.cta} onChange={set('cta')} placeholder="Chama no WhatsApp, link na bio." /></div>
        <div><Label>Stories</Label><Input value={f.stories} onChange={set('stories')} placeholder="repost + enquete" /></div>
      </div>
      <div><Label>A confirmar</Label><Input value={f.pending} onChange={set('pending')} placeholder="horário do evento, lista de prêmios…" /></div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><Label>Campanha</Label><Select value={f.campaignId} onChange={set('campaignId')}><option value="">—</option>{view.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
        <div><Label>Evento</Label><Select value={f.eventId} onChange={set('eventId')}><option value="">—</option>{view.events.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.start.slice(8, 10)}/{e.start.slice(5, 7)})</option>)}</Select></div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => savePostAction(view.month, post?.id ?? null, {
          ...f, body: f.body || null, cta: f.cta || null, stories: f.stories || null, pending: f.pending || null, campaignId: f.campaignId || null, eventId: f.eventId || null,
        }), onDone)}>Salvar</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancelar</Button>
      </div>
      <FormMessage error={msg.error} success={msg.ok} />
    </div>
  );
}
