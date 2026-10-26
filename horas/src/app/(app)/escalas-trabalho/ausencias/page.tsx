import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listAbsences, listSectors, loadMonth } from '@/server/services/ws-service';
import { resolveParams } from '../params';
import { SectorMonthPicker } from '../shared';
import { AbsenceClient } from './AbsenceClient';

export const metadata: Metadata = { title: 'Férias e ausências — Escalas 5x2' };

export default async function AusenciasPage({ searchParams }: { searchParams: Promise<{ setor?: string; mes?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'ws.view')) redirect('/hoje');
  const sectors = (await listSectors(principal)).filter((s) => s.active);
  const q = resolveParams(await searchParams, sectors);
  const header = <PageHeader title="Férias e ausências" description="Férias, faltas, atestados, afastamentos, folgas extraordinárias, indisponibilidades e substituições. É o mesmo registro da Gestão de Horas (sem cadastro duplicado). Registrar não muda a escala publicada: o impacto aparece nos alertas da escala, com sugestão de substituto." />;
  if (!q.sectorId) return <>{header}<Card className="p-6 text-sm text-tinta-suave">Nenhum setor. <Link href="/escalas-trabalho/pre-requisitos" className="font-semibold text-nacao underline">Criar setor</Link></Card></>;
  const [abs, view] = await Promise.all([listAbsences(principal, q.sectorId, q.year, q.month), loadMonth(principal, q.sectorId, q.year, q.month)]);
  const impact = view.analysis?.alerts.filter((a) => a.code === 'AUSENTE_ESCALADO') ?? [];
  return (
    <>
      {header}
      <Card className="mb-4 p-4"><SectorMonthPicker sectors={sectors} sectorId={q.sectorId} month={q.mes} /></Card>
      <AbsenceClient sectorId={q.sectorId} mes={q.mes} members={abs.members} leaves={abs.leaves} impact={impact} stats={view.analysis?.members ?? []} hasSchedule={!!view.schedule} monthLabel={view.month.label} canEdit={can(principal, 'ws.edit')} />
    </>
  );
}
