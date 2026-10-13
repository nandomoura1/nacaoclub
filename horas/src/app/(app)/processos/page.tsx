import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ClipboardList, ExternalLink, ListChecks, Plus, UserRound } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { todayIso } from '@/lib/today';
import { NACAO_TASK_URL, type Health } from '@/domain/processos';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { procPanel } from '@/server/services/proc-service';

export const metadata: Metadata = { title: 'Gestão de Processos' };

const HEALTH: Record<Health, { label: string; dot: string; ring: string }> = {
  vermelho: { label: 'Precisa de atenção', dot: 'bg-critico', ring: 'ring-critico/30' },
  amarelo: { label: 'Em alerta', dot: 'bg-atencao', ring: 'ring-atencao/30' },
  verde: { label: 'Em dia', dot: 'bg-sucesso', ring: 'ring-sucesso/25' },
  sem_demandas: { label: 'Sem demandas abertas', dot: 'bg-tinta-fraca/40', ring: 'ring-borda' },
};
const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'proc.view')) redirect('/hoje');
  const today = todayIso();
  const { sectors, totals } = await procPanel(principal, today);
  const admin = can(principal, 'proc.admin');

  return (
    <>
      <PageHeader title="Gestão de Processos" description={admin ? 'Como está cada setor: demandas em aberto, atrasos e entregas do mês. As rotinas e checklists ficam no Nação Task.' : 'Os setores que você lidera: demandas em aberto, atrasos e entregas do mês.'} />

      {/* Nação Task: onde as rotinas acontecem */}
      <Card className="mb-4 flex flex-wrap items-center gap-3 border-nacao/25 bg-linear-to-r from-navy to-nacao p-4 text-white">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15"><ListChecks className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Rotinas e checklists: Nação Task</p>
          <p className="text-sm text-white/75">Abertura, fechamento, limpeza, manutenção e os processos já desenhados de cada setor.</p>
        </div>
        <a href={NACAO_TASK_URL} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'secondary', size: 'sm' })}><ExternalLink /> Abrir Nação Task</a>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Demandas abertas', value: totals.open, icon: ClipboardList, tone: 'text-navy' },
          { label: 'Atrasadas', value: totals.late, icon: AlertTriangle, tone: totals.late ? 'text-critico' : 'text-navy' },
          { label: 'Vencem em 7 dias', value: totals.dueSoon, icon: ClipboardList, tone: 'text-navy' },
          { label: 'Concluídas no mês', value: totals.doneMonth, icon: CheckCircle2, tone: 'text-sucesso' },
        ].map((k) => (
          <Card key={k.label} className="p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-tinta-suave"><k.icon className="size-3.5" /> {k.label}</p>
            <p className={cn('mt-1 font-titulo text-2xl font-extrabold tabular-nums', k.tone)}>{k.value}</p>
          </Card>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-sm font-bold text-navy">{admin ? 'Setores' : 'Seus setores'}</h2>
        <Link href="/processos/demandas" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>Todas as demandas</Link>
        {(admin || can(principal, 'proc.edit')) && sectors.length > 0 && <Link href="/processos/demandas?nova=1" className={buttonVariants({ size: 'sm' })}><Plus /> Nova demanda</Link>}
      </div>

      {sectors.length === 0 ? (
        <Card className="p-8 text-center text-sm text-tinta-suave">
          {admin ? <>Nenhum setor ativo. <Link className="font-semibold text-nacao" href="/processos/setores">Cadastre os setores e líderes</Link>.</> : 'Você ainda não é líder de nenhum setor. Peça à diretoria para te vincular em Setores e líderes.'}
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {sectors.map((s) => {
            const h = HEALTH[s.stats.health];
            return (
              <Card key={s.id} className={cn('flex flex-col gap-3 p-4 ring-2', h.ring)}>
                <div className="flex items-start gap-2">
                  <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', h.dot)} title={h.label} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-navy">{s.name}</p>
                    <p className="flex items-center gap-1 text-xs text-tinta-suave"><UserRound className="size-3" /> {s.leader ?? <span className="italic">sem líder definido</span>}</p>
                  </div>
                  <Badge tone={s.stats.health === 'vermelho' ? 'red' : s.stats.health === 'amarelo' ? 'amber' : s.stats.health === 'verde' ? 'green' : 'neutral'}>{h.label}</Badge>
                </div>
                <dl className="grid grid-cols-4 gap-1 text-center">
                  {[['Abertas', s.stats.open], ['Atrasadas', s.stats.late], ['7 dias', s.stats.dueSoon], ['Feitas/mês', s.stats.doneMonth]].map(([l, v]) => (
                    <div key={l as string} className="rounded-lg bg-fundo px-1 py-1.5">
                      <dd className={cn('font-titulo text-lg font-extrabold tabular-nums text-navy', l === 'Atrasadas' && (v as number) > 0 && 'text-critico')}>{v}</dd>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-tinta-suave">{l}</dt>
                    </div>
                  ))}
                </dl>
                {s.top.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {s.top.map((d) => (
                      <li key={d.id} className="flex items-center gap-2">
                        <span className={cn('size-1.5 shrink-0 rounded-full', d.late ? 'bg-critico' : d.priority === 'URGENTE' || d.priority === 'ALTA' ? 'bg-atencao' : 'bg-tinta-fraca/50')} />
                        <span className="min-w-0 flex-1 truncate">{d.title}</span>
                        {d.dueDate && <span className={cn('shrink-0 text-xs tabular-nums', d.late ? 'font-semibold text-critico' : 'text-tinta-suave')}>{fmt(d.dueDate)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Link href={`/processos/demandas?setor=${s.id}`} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>Demandas</Link>
                  <a href={s.taskUrl ?? NACAO_TASK_URL} target="_blank" rel="noreferrer" className={buttonVariants({ size: 'sm', variant: 'ghost' })}><ExternalLink /> Rotinas no Nação Task</a>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
