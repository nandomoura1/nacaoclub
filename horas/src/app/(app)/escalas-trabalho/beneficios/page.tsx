import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { transportReport } from '@/server/services/ws-service';
import { resolveParams } from '../params';
import { TransportClient } from './TransportClient';

export const metadata: Metadata = { title: 'Benefícios — Escalas 5x2' };

export default async function BeneficiosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'ws.view')) redirect('/hoje');
  const q = resolveParams(await searchParams, []);
  const report = await transportReport(principal, q.year, q.month);
  return (
    <>
      <PageHeader title="Benefícios" description="Passagem (vale-transporte) e alimentação do mês para a escala 5x2 (CLT e FUNAP). Passagem: dias de trabalho menos as faltas e atestados do mês anterior. Alimentação: só os dias de trabalho do mês, para quem tem direito." />
      <TransportClient key={q.mes} mes={q.mes} report={report} />
    </>
  );
}
