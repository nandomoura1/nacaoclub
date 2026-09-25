import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Upload } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { isIsoDate } from '@/domain/dates';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listGrade } from '@/server/services/schedule-service';
import { GradeClient } from './GradeClient';

export const metadata: Metadata = { title: 'Grade semanal' };

export default async function GradePage({ searchParams }: { searchParams: Promise<{ data?: string; area?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'schedule.view')) redirect('/hoje');
  const sp = await searchParams;
  const date = sp.data && isIsoDate(sp.data) ? sp.data : todayIso();
  const scoped = principal.areaIds === null ? {} : { id: { in: [...principal.areaIds] } };

  const areas = await prisma.coordinationArea.findMany({ where: { deletedAt: null, active: true, ...scoped }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, color: true } });
  const areaId = sp.area && areas.some((a) => a.id === sp.area) ? sp.area : null;

  const [grade, modalities, activityTypes, spaces, teachers] = await Promise.all([
    listGrade(principal, date, areaId),
    prisma.modality.findMany({
      where: { active: true, ...(principal.areaIds === null ? {} : { areaId: { in: [...principal.areaIds] } }) },
      orderBy: [{ sortOrder: 'asc' }], select: { id: true, name: true, color: true, areaId: true, defaultDurationMin: true },
    }),
    prisma.activityType.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, kind: true } }),
    prisma.space.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.teacher.findMany({
      where: { active: true }, orderBy: { name: 'asc' },
      select: { id: true, name: true, displayName: true, modalities: { select: { modalityId: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Grade semanal"
        description="A grade padrão que se repete toda semana. Toda mudança vale a partir de uma data — o passado nunca é reescrito."
        actions={can(principal, 'import.run') ? (
          <Link href="/grade/importar" className={buttonVariants({ variant: 'secondary' })}><Upload /> Importar planilha</Link>
        ) : undefined}
      />
      <GradeClient
        date={date}
        today={todayIso()}
        areaId={areaId}
        areas={areas}
        grade={grade}
        canEdit={can(principal, 'schedule.edit')}
        modalities={modalities}
        activityTypes={activityTypes}
        spaces={spaces}
        teachers={teachers.map((t) => ({ id: t.id, name: t.displayName || t.name, fullName: t.name, modalityIds: t.modalities.map((m) => m.modalityId) }))}
      />
    </>
  );
}
