import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, PageHeader } from '@/components/ui/card';
import { formatDateBR } from '@/domain/dates';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listSimulations } from '@/server/services/grade-sim-service';
import { NewSimulation } from './NewSimulation';

export const metadata: Metadata = { title: 'Simulações de grade' };
export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: 'neutral' | 'green' | 'red' }> = {
  RASCUNHO: { label: 'Em simulação', tone: 'neutral' }, IMPLANTADA: { label: 'Implantada', tone: 'green' }, DESCARTADA: { label: 'Descartada', tone: 'red' },
};

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'schedule.edit')) redirect('/grade');
  const [sims, areas] = await Promise.all([
    listSimulations(principal),
    prisma.coordinationArea.findMany({ where: { deletedAt: null, active: true, ...(principal.areaIds === null ? {} : { id: { in: [...principal.areaIds] } }) }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <Link href="/grade" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-tinta-suave hover:text-nacao"><ArrowLeft className="size-4" /> Grade semanal</Link>
      <PageHeader title="Simulações de grade" description="Monte uma nova grade num rascunho, compare as horas de cada professor com a grade atual e, se aprovar, implante a partir de uma data. A grade real só muda quando você implanta." />
      <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <NewSimulation areas={areas} today={todayIso()} allAreas={principal.areaIds === null} />
        <Card className="divide-y divide-borda">
          {sims.length === 0 && <p className="p-6 text-sm text-tinta-suave">Nenhuma simulação ainda. Comece copiando a grade atual ao lado.</p>}
          {sims.map((s) => (
            <Link key={s.id} href={`/grade/simulacao/${s.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-fundo">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-tinta">{s.name}</span>
                <span className="block text-xs text-tinta-suave">{s.area ?? 'Todas as áreas'} · {s.items} aulas · base {formatDateBR(s.baseDate)}{s.createdBy ? ` · por ${s.createdBy}` : ''}</span>
              </span>
              <span className="text-xs text-tinta-suave">{s.status === 'IMPLANTADA' ? `vale desde ${s.effectiveFrom ? formatDateBR(s.effectiveFrom) : '—'}` : s.effectiveFrom ? `planejada p/ ${formatDateBR(s.effectiveFrom)}` : ''}</span>
              <Badge tone={STATUS[s.status]?.tone ?? 'neutral'}>{STATUS[s.status]?.label ?? s.status}</Badge>
            </Link>
          ))}
        </Card>
      </div>
    </>
  );
}
