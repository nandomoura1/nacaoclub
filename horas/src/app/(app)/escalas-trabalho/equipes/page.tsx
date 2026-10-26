import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listSectors, sectorSetup } from '@/server/services/ws-service';
import { resolveParams } from '../params';
import { SectorMonthPicker } from '../shared';
import { TeamClient } from './TeamClient';

export const metadata: Metadata = { title: 'Equipes — Escalas 5x2' };

export default async function EquipesPage({ searchParams }: { searchParams: Promise<{ setor?: string; mes?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'ws.view')) redirect('/hoje');
  const sectors = (await listSectors(principal)).filter((s) => s.active);
  const q = resolveParams(await searchParams, sectors);
  const header = <PageHeader title="Equipes" description="Quem trabalha em cada setor, com função, vínculo, horário habitual, folgas fixas e disponibilidade. Usa o cadastro de pessoas que o sistema já tem (sem duplicar)." />;
  if (!q.sectorId) return <>{header}<Card className="p-6 text-sm text-tinta-suave">Nenhum setor. <Link href="/escalas-trabalho/pre-requisitos" className="font-semibold text-nacao underline">Criar setor</Link></Card></>;
  const setup = await sectorSetup(principal, q.sectorId);
  return (
    <>
      {header}
      <Card className="mb-4 p-4"><SectorMonthPicker sectors={sectors} sectorId={q.sectorId} month={q.mes} showMonth={false} /></Card>
      <TeamClient sectorId={q.sectorId} members={setup.sector.members.map((m) => ({ ...m, name: m.teacher.displayName || m.teacher.name, hours: m.hours as never }))} people={setup.people} canEdit={can(principal, 'ws.edit')} />
    </>
  );
}
