import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listTeachers } from '@/server/services/teacher-service';
import { TeachersClient } from './TeachersClient';

export const metadata: Metadata = { title: 'Professores' };

export default async function ProfessoresPage() {
  const principal = await requirePrincipal();
  if (!can(principal, 'teacher.view')) redirect('/hoje');

  const [teachers, modalities, areas, positions, contractTypes] = await Promise.all([
    listTeachers(principal, { includeInactive: true }),
    prisma.modality.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, color: true, areaId: true } }),
    prisma.coordinationArea.findMany({ where: { deletedAt: null, active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.position.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.contractType.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Professores"
        description="Professores, instrutores e estagiários. As modalidades habilitadas alimentam a sugestão de substitutos."
      />
      <TeachersClient
        teachers={teachers}
        modalities={modalities}
        areas={areas}
        positions={positions}
        contractTypes={contractTypes}
        canEdit={can(principal, 'teacher.edit')}
        myAreaIds={principal.areaIds ? [...principal.areaIds] : null}
      />
    </>
  );
}
