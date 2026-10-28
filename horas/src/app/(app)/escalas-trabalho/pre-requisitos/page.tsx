import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/card';
import { fromUtc } from '@/domain/dates';
import type { HoursMap } from '@/domain/escalas/types';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listSectors, RULE_KIND_OPTIONS, sectorSetup } from '@/server/services/ws-service';
import { resolveParams } from '../params';
import { SectorMonthPicker } from '../shared';
import { SectorAdmin, SetupClient } from './SetupClient';

export const metadata: Metadata = { title: 'Pré-requisitos — Escalas 5x2' };

export default async function PreRequisitosPage({ searchParams }: { searchParams: Promise<{ setor?: string; mes?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'ws.view')) redirect('/hoje');
  const all = await listSectors(principal);
  const sectors = all.filter((s) => s.active);
  const q = resolveParams(await searchParams, sectors);
  const admin = can(principal, 'ws.admin');
  const procSectors = admin ? await prisma.procSector.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }) : [];
  const setup = q.sectorId ? await sectorSetup(principal, q.sectorId) : null;
  return (
    <>
      <PageHeader title="Pré-requisitos do setor" description="Horário do setor, postos que precisam de gente (abertura, fechamento, almoço…) e regras de folga e revezamento. Obrigatória: sem ela a escala tem conflito. Preferencial: o sistema atende sempre que possível. Regras legais ficam em Parâmetros legais e não viram preferenciais." />
      {admin && <SectorAdmin sectors={all.map((s) => ({ id: s.id, name: s.name, procSectorId: s.procSectorId, active: s.active, sortOrder: s.sortOrder, hours: s.hours as HoursMap, cycleRef: fromUtc(s.cycleRef), notes: s.notes, procSector: s.procSector?.name ?? null }))} procSectors={procSectors} />}
      {q.sectorId && setup ? (
        <>
          <Card className="mb-4 p-4"><SectorMonthPicker sectors={sectors} sectorId={q.sectorId} month={q.mes} showMonth={false} /></Card>
          <SetupClient
            key={q.sectorId}
            sectorId={q.sectorId}
            hours={setup.sector.hours as HoursMap}
            cycleRef={fromUtc(setup.sector.cycleRef)}
            notes={setup.sector.notes}
            holidayMode={setup.sector.holidayMode}
            holidayConfirm={setup.sector.holidayConfirm}
            holidayRotate={setup.sector.holidayRotate}
            holidayStaff={setup.sector.holidayStaff}
            posts={setup.sector.posts}
            rules={setup.rules.map((r) => ({ id: r.id, kind: r.kind, label: r.label, params: r.params as Record<string, unknown>, mandatory: r.mandatory, active: r.active, description: r.description }))}
            members={setup.sector.members.filter((m) => m.active).map((m) => ({ id: m.id, name: m.teacher.displayName || m.teacher.name }))}
            kinds={RULE_KIND_OPTIONS}
            canEdit={can(principal, 'ws.edit')}
          />
        </>
      ) : !admin && <Card className="p-6 text-sm text-tinta-suave">Você ainda não lidera nenhum setor com escala.</Card>}
    </>
  );
}
