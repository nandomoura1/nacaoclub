import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { transportReport } from '@/server/services/ws-service';
import { resolveParams } from '../params';
import { TransportClient } from './TransportClient';

export const metadata: Metadata = { title: 'Passagem — Escalas 5x2' };

export default async function PassagemPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'ws.view')) redirect('/hoje');
  const q = resolveParams(await searchParams, []);
  const report = await transportReport(principal, q.year, q.month);
  return (
    <>
      <PageHeader title="Passagem" description="Vale-transporte do mês para toda a escala 5x2 (CLT e FUNAP): dias de trabalho do mês menos as faltas e atestados do mês anterior, vezes o valor diário (ida e volta) de cada pessoa." />
      <TransportClient key={q.mes} mes={q.mes} report={report} />
    </>
  );
}
