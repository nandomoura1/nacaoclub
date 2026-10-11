import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, ChevronRight, Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES, labelOf } from '@/domain/marketing/constants';
import { cn } from '@/lib/cn';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listCampaigns } from '@/server/services/marketing-service';
import { CampaignStatusBadge, ReadinessRing, daysLabel, fmtDate } from '../_components/ui';

export const metadata: Metadata = { title: 'Campanhas' };

const GROUPS = [
  { key: 'andamento', label: 'Em andamento', st: ['PLANEJAMENTO', 'PRODUCAO', 'AGUARDANDO_APROVACAO', 'PROGRAMADA', 'ATIVA'] },
  { key: 'ideias', label: 'Ideias', st: ['IDEIA'] },
  { key: 'concluidas', label: 'Concluídas', st: ['FINALIZADA', 'ANALISE'] },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ g?: string; tipo?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const today = todayIso();
  const sp = await searchParams;
  const g = GROUPS.find((x) => x.key === sp.g) ?? GROUPS[0]!;
  const all = await listCampaigns(principal, today);
  const rows = all.filter((c) => g.st.includes(c.status) && (!sp.tipo || c.type === sp.tipo));
  return (
    <>
      <PageHeader title="Campanhas" description="Cada campanha com briefing, readiness, tarefas por área e histórico."
        actions={can(principal, 'mkt.edit') ? <Link href="/marketing/campanhas/nova" className={buttonVariants({ size: 'sm' })}><Plus /> Campanha</Link> : undefined} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {GROUPS.map((x) => (
          <Link key={x.key} href={`?g=${x.key}${sp.tipo ? `&tipo=${sp.tipo}` : ''}`} className={cn('rounded-full px-3 py-1 font-semibold', g.key === x.key ? 'bg-nacao text-white' : 'bg-white text-tinta-suave ring-1 ring-borda')}>
            {x.label} ({all.filter((c) => x.st.includes(c.status)).length})
          </Link>
        ))}
        <span className="flex-1" />
        <form className="flex items-center gap-1">
          <input type="hidden" name="g" value={g.key} />
          <select name="tipo" defaultValue={sp.tipo ?? ''} className="h-8 rounded-lg border border-borda bg-white px-2 text-xs">
            <option value="">Todos os tipos</option>{CAMPAIGN_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <button className="text-xs font-semibold text-nacao">filtrar</button>
        </form>
      </div>
      <Card className="divide-y divide-borda">
        {rows.length === 0 && <p className="p-6 text-center text-sm text-tinta-suave">Nenhuma campanha aqui.</p>}
        {rows.map((c) => {
          const days = Math.round((Date.parse(c.startDate) - Date.parse(today)) / 86_400_000);
          return (
            <Link key={c.id} href={`/marketing/campanhas/${c.id}`} className="flex flex-wrap items-center gap-3 p-3 hover:bg-fundo">
              <ReadinessRing score={c.readiness} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-navy">{c.name}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-tinta-suave">
                  <CampaignStatusBadge status={c.status} /> {labelOf(CAMPAIGN_TYPES, c.type)} · {fmtDate(c.startDate)}{c.endDate && c.endDate !== c.startDate ? `–${fmtDate(c.endDate)}` : ''} ({daysLabel(days)}){c.owner ? ` · ${c.owner}` : ''}
                </p>
              </div>
              <span className="text-xs text-tinta-suave">{c.tasks.done}/{c.tasks.total} tarefas</span>
              {c.tasks.late > 0 && <span className="inline-flex items-center gap-1 text-xs font-semibold text-critico"><AlertTriangle className="size-3.5" /> {c.tasks.late} atrasada(s)</span>}
              {c.alerts > 0 && <span className="rounded-full bg-atencao/15 px-2 py-0.5 text-[11px] font-semibold text-atencao">{c.alerts} alerta(s)</span>}
              <ChevronRight className="size-4 text-tinta-fraca" />
            </Link>
          );
        })}
      </Card>
      <p className="mt-2 text-[11px] text-tinta-fraca">Status: {CAMPAIGN_STATUSES.map((s) => s.label).join(' → ')}.</p>
    </>
  );
}
