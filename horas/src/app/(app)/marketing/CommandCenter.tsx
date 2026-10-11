'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarDays, Check, ChevronRight, Megaphone, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { addDays } from '@/domain/dates';
import { AREAS } from '@/domain/marketing/constants';
import { cn } from '@/lib/cn';
import type { CommandCenterView, MktOptions } from '@/server/services/marketing-service';
import { decideRecommendationAction, refreshRecommendationsAction } from './actions';
import { TaskSheet, type TaskDefaults } from './_components/TaskSheet';
import { CampaignStatusBadge, ReadinessRing, daysLabel, fmtDate } from './_components/ui';
import { useRun } from './_components/useRun';

const KIND_LABEL = { evento: 'Evento', campanha: 'Campanha', item: 'Data' } as const;

/** Command Center: o que importa hoje, nesta semana e o que a IA recomenda. */
export function CommandCenter({ v, options, today, perms }: { v: CommandCenterView; options: MktOptions; today: string; perms: { edit: boolean; ai: boolean } }) {
  const { msg, pending, run } = useRun();
  const [sheet, setSheet] = useState<TaskDefaults | null>(null);
  const [thinking, setThinking] = useState(false);
  const stats = [
    { label: 'Ativas', value: v.counts.ativas, href: '/marketing/campanhas' },
    { label: 'Em preparação', value: v.counts.planejadas, href: '/marketing/campanhas' },
    { label: 'Aguardando aprovação', value: v.counts.aprovacao, href: '/marketing/campanhas', warn: v.counts.aprovacao > 0 },
    { label: 'Campanhas atrasadas', value: v.counts.atrasadas, href: '/marketing/campanhas', bad: v.counts.atrasadas > 0 },
    { label: 'Tarefas da semana', value: v.counts.tarefasSemana, href: '/marketing/kanban' },
    { label: 'Tarefas atrasadas', value: v.counts.tarefasAtrasadas, href: '/marketing/kanban?atrasadas=1', bad: v.counts.tarefasAtrasadas > 0 },
  ];
  const areaName = (k: string) => AREAS.find((a) => a.key === k)?.name ?? k;

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl bg-navy p-5 text-white">
        <div className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-nacao/40 blur-3xl" />
        <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Marketing Nação</p>
        <h1 className="mt-1 font-titulo text-2xl font-extrabold">Command Center</h1>
        <p className="mt-1 max-w-xl text-sm text-white/70">Nenhuma campanha começa sem plano. O que precisa de atenção, o que acontece na semana e quão prontas estão as próximas campanhas.</p>
        {perms.edit && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/marketing/campanhas/nova" className={buttonVariants({ size: 'sm' })}><Plus /> Campanha</Link>
            <Link href="/marketing/eventos?novo=1" className={cn(buttonVariants({ size: 'sm', variant: 'secondary' }))}><Plus /> Evento</Link>
            <Button size="sm" variant="secondary" onClick={() => setSheet({ column: 'SEMANA' })}><Plus /> Tarefa</Button>
            <Link href="/marketing/reuniao" className={cn(buttonVariants({ size: 'sm', variant: 'secondary' }))}>Reunião semanal</Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-xl border border-borda bg-white p-3 transition-shadow hover:shadow-md">
            <p className={cn('font-titulo text-2xl font-extrabold tabular-nums', s.bad ? 'text-critico' : s.warn ? 'text-atencao' : 'text-navy')}>{s.value}</p>
            <p className="text-xs text-tinta-suave">{s.label}</p>
          </Link>
        ))}
      </div>

      <FormMessage error={msg.error} success={msg.ok} />

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="p-4 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-bold text-navy"><AlertTriangle className="size-4 text-atencao" /> Precisa de atenção</h2>
          {v.attention.length === 0 && <p className="mt-2 text-sm text-tinta-suave">Tudo em dia. 🎯</p>}
          <ul className="mt-2 divide-y divide-borda">
            {v.attention.map((a, i) => (
              <li key={i} className="flex flex-wrap items-start gap-2 py-2 text-sm">
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', a.level === 'critico' ? 'bg-critico' : 'bg-atencao')} />
                <span className="min-w-0 flex-1">{a.text}</span>
                <span className="flex shrink-0 gap-2">
                  {a.suggestion && perms.edit && (
                    <button type="button" className="text-xs font-semibold text-nacao hover:underline"
                      onClick={() => setSheet({ campaignId: a.suggestion!.campaignId, title: a.suggestion!.title, areaKey: a.suggestion!.area, dueDate: addDays(today, Math.max(0, a.suggestion!.offset)), column: 'SEMANA', origin: 'ANTECEDENCIA' })}>
                      Criar tarefa
                    </button>
                  )}
                  {a.campaignId && <Link href={`/marketing/campanhas/${a.campaignId}`} className="text-xs font-semibold text-tinta-suave hover:text-nacao">abrir</Link>}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <h2 className="flex items-center gap-2 font-bold text-navy"><CalendarDays className="size-4 text-nacao" /> Esta semana</h2>
          {v.week.length === 0 && !v.counts.tarefasSemana && <p className="mt-2 text-sm text-tinta-suave">Nada no calendário desta semana.</p>}
          <ul className="mt-2 space-y-1.5">
            {v.week.map((w) => (
              <li key={`${w.kind}${w.id}`} className="flex items-center gap-2 text-sm">
                <span className="w-11 shrink-0 font-titulo text-xs font-bold text-tinta-suave">{fmtDate(w.date)}</span>
                <span className="min-w-0 flex-1 truncate">{w.kind === 'campanha' ? <Link href={`/marketing/campanhas/${w.id}`} className="hover:text-nacao">{w.title}</Link> : w.title}</span>
                <span className="shrink-0 rounded bg-fundo px-1.5 text-[10px] text-tinta-suave">{KIND_LABEL[w.kind]}</span>
              </li>
            ))}
          </ul>
          {v.counts.tarefasSemana > 0 && <Link href="/marketing/kanban" className="mt-3 block rounded-lg bg-fundo px-3 py-2 text-sm hover:text-nacao"><b>{v.counts.tarefasSemana}</b> tarefa(s) com prazo até domingo →</Link>}
          <Link href="/marketing/calendario?v=semana" className="mt-3 inline-flex items-center text-xs font-semibold text-nacao">ver calendário <ChevronRight className="size-3" /></Link>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="p-4 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-bold text-navy"><Megaphone className="size-4 text-nacao" /> Readiness — próximos 30 dias</h2>
          {v.readiness.length === 0 && <p className="mt-2 text-sm text-tinta-suave">Nenhuma campanha começando nos próximos 30 dias.</p>}
          <ul className="mt-2 divide-y divide-borda">
            {v.readiness.map((r) => (
              <li key={r.id}>
                <Link href={`/marketing/campanhas/${r.id}`} className="flex items-center gap-3 py-2 hover:bg-fundo/60">
                  <ReadinessRing score={r.score} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-tinta">{r.name}</p>
                    <p className="truncate text-xs text-tinta-suave">{fmtDate(r.startDate)} · {daysLabel(r.daysTo)}{r.missing.length > 0 && ` · falta: ${r.missing.slice(0, 3).join(', ').toLowerCase()}`}</p>
                  </div>
                  <CampaignStatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <h2 className="font-bold text-navy">Próximos eventos</h2>
          {v.events.length === 0 && <p className="mt-2 text-sm text-tinta-suave">Nenhum evento cadastrado.</p>}
          <ul className="mt-2 space-y-2">
            {v.events.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className="grid w-12 shrink-0 place-items-center rounded-lg bg-nacao/10 py-1 font-titulo text-xs font-extrabold text-nacao">D-{e.daysTo}</span>
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="shrink-0 text-xs text-tinta-suave">{fmtDate(e.startDate)}</span>
              </li>
            ))}
          </ul>
          <Link href="/marketing/eventos" className="mt-3 inline-flex items-center text-xs font-semibold text-nacao">todos os eventos <ChevronRight className="size-3" /></Link>
        </Card>
      </div>

      <Card className="border-nacao/20 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex flex-1 items-center gap-2 font-bold text-navy"><Sparkles className="size-4 text-nacao" /> Recomendações da IA</h2>
          {perms.ai && (
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => { setThinking(true); run(() => refreshRecommendationsAction(), () => setThinking(false)); }}>
              <RefreshCw className={cn(thinking && pending && 'animate-spin')} /> {thinking && pending ? 'Analisando…' : 'Atualizar recomendações'}
            </Button>
          )}
        </div>
        <p className="text-xs text-tinta-suave">Sugestões — nada acontece sem o seu aceite.{v.recommendations && ` Geradas em ${new Date(v.recommendations.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`}</p>
        {!v.recommendations && <p className="mt-3 text-sm text-tinta-suave">Ainda sem recomendações. {perms.ai ? 'Clique em “Atualizar recomendações”.' : ''}</p>}
        <ol className="mt-3 space-y-2">
          {v.recommendations?.items.map((r, i) => (
            <li key={i} className={cn('rounded-xl border p-3 text-sm', r.estado === 'aceita' ? 'border-sucesso/30 bg-sucesso/5' : r.estado === 'ignorada' ? 'border-borda opacity-60' : 'border-borda')}>
              <div className="flex flex-wrap items-start gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-bold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-tinta">{r.titulo}</p>
                  <p className="text-xs text-tinta-suave">{r.porque}</p>
                  {r.tarefa && <p className="mt-1 text-xs text-nacao">→ tarefa: {r.tarefa.titulo} · {areaName(r.tarefa.area)} · prazo {daysLabel(r.tarefa.prazoDias)}</p>}
                </div>
                {r.estado ? (
                  <span className="shrink-0 text-xs font-semibold text-tinta-suave">{r.estado === 'aceita' ? 'aceita ✓' : 'ignorada'}</span>
                ) : perms.edit && (
                  <span className="ml-8 flex w-full shrink-0 gap-1 sm:ml-0 sm:w-auto">
                    <Button size="sm" disabled={pending} onClick={() => run(() => decideRecommendationAction(v.recommendations!.id, i, true))}><Check /> Aceitar</Button>
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => decideRecommendationAction(v.recommendations!.id, i, false))}><X /> Ignorar</Button>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {sheet && <TaskSheet taskId={null} defaults={sheet} options={options} canEdit={perms.edit} onClose={() => setSheet(null)} />}
    </div>
  );
}
