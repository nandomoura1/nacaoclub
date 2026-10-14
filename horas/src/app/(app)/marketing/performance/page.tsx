import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { isIsoDate } from '@/domain/dates';
import { presetRange } from '@/domain/marketing/traffic';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { performancePanel } from '@/server/services/mkt-performance-service';
import { PerformanceView } from './PerformanceView';

export const metadata: Metadata = { title: 'Performance' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const sp = await searchParams;
  const today = todayIso();
  const custom = sp.de && sp.ate && isIsoDate(sp.de) && isIsoDate(sp.ate) && sp.de <= sp.ate;
  const preset = custom ? 'custom' : sp.periodo ?? 'mes';
  const range = custom ? { from: sp.de!, to: sp.ate! } : presetRange(preset, today);
  // "Este mês" compara só até hoje, para não comparar mês parcial com mês cheio.
  const effective = preset === 'mes' ? { from: range.from, to: today < range.to ? today : range.to } : range;
  const report = await performancePanel(principal, effective.from, effective.to);
  return (
    <>
      <PageHeader title="Performance" description="O marketing em números: cliques, leads, matrículas e investimento — comparados com o período anterior e mês a mês. É o painel da reunião semanal." />
      <PerformanceView report={report} preset={preset} />
    </>
  );
}
