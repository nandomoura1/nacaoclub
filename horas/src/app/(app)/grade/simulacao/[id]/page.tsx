import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { NotFoundError } from '@/server/errors';
import { getSimulation } from '@/server/services/grade-sim-service';
import { SimEditor } from './SimEditor';

export const metadata: Metadata = { title: 'Simulação de grade' };
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'schedule.edit')) redirect('/grade');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect('/grade/simulacao');
  let sim;
  try { sim = await getSimulation(principal, id); } catch (e) { if (e instanceof NotFoundError) redirect('/grade/simulacao'); throw e; }
  const usedTeachers = [...new Set([...sim.items, ...sim.current].flatMap((i) => i.people.map((p) => p.teacherId)))];
  const [modalities, activityTypes, spaces, teachers] = await Promise.all([
    prisma.modality.findMany({
      where: { active: true, ...(principal.areaIds === null ? {} : { areaId: { in: [...principal.areaIds] } }), ...(sim.areaId ? { areaId: sim.areaId } : {}) },
      orderBy: [{ sortOrder: 'asc' }], select: { id: true, name: true, color: true, defaultDurationMin: true, areaId: true, area: { select: { name: true } } },
    }),
    prisma.activityType.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, countsHours: true, active: true } }),
    prisma.space.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.teacher.findMany({
      where: { OR: [{ active: true, team: 'PROFESSOR' }, { id: { in: usedTeachers } }] }, orderBy: { name: 'asc' },
      select: { id: true, name: true, displayName: true, active: true },
    }),
  ]);
  return (
    <>
      <Link href="/grade/simulacao" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-tinta-suave hover:text-nacao"><ArrowLeft className="size-4" /> Simulações de grade</Link>
      <SimEditor
        sim={sim}
        today={todayIso()}
        modalities={modalities.map(({ area, ...m }) => ({ ...m, areaName: area.name }))}
        activityTypes={activityTypes}
        spaces={spaces}
        teachers={teachers.map((t) => ({ id: t.id, name: t.displayName || t.name, active: t.active }))}
      />
    </>
  );
}
