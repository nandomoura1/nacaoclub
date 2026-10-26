import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { calendarData, listSectors } from '@/server/services/ws-service';
import { resolveParams } from '../params';
import { CalendarClient } from './CalendarClient';

export const metadata: Metadata = { title: 'Funcionamento — Escalas 5x2' };

export default async function FuncionamentoPage({ searchParams }: { searchParams: Promise<{ setor?: string; mes?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'ws.view')) redirect('/hoje');
  const sectors = (await listSectors(principal)).filter((s) => s.active);
  const q = resolveParams(await searchParams, sectors);
  const data = await calendarData(principal, q.year, q.month);
  return (
    <>
      <PageHeader title="Funcionamento da Nação" description="Horário geral da Nação, feriados (os mesmos do Calendário), eventos do Marketing e exceções por data. O horário geral é só referência: cada setor tem o seu, e a exceção do setor vence." />
      <CalendarClient data={data} mes={q.mes} sectorId={q.sectorId} canEdit={can(principal, 'ws.edit')} />
    </>
  );
}
