import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { isMonth } from '@/domain/marketing/cronograma';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { getCronograma } from '@/server/services/mkt-cronograma-service';
import { CronogramaClient } from './CronogramaClient';

export const metadata: Metadata = { title: 'Cronograma do mês' };
export const dynamic = 'force-dynamic';
// "Sugerir com IA" chama o modelo.
export const maxDuration = 300;

export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const sp = await searchParams;
  const today = todayIso();
  // Padrão: o mês seguinte a partir do dia 15 (é quando se planeja), senão o atual.
  const fallback = Number(today.slice(8, 10)) >= 15
    ? new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1)).toISOString().slice(0, 7)
    : today.slice(0, 7);
  const month = isMonth(sp.mes) ? sp.mes : fallback;
  const view = await getCronograma(principal, month);
  return (
    <>
      <PageHeader title="Cronograma do mês" description="Planejamento das postagens a partir do calendário da Nação: objetivos do mês, um post por dia, IA sugere, a equipe ajusta e aprova. Cada post pode virar tarefa no Kanban ou ligar a uma campanha ou evento." />
      <CronogramaClient view={view} today={today}
        can={{ edit: can(principal, 'mkt.edit'), ai: can(principal, 'mkt.ai'), approve: can(principal, 'mkt.approve') }} />
    </>
  );
}
