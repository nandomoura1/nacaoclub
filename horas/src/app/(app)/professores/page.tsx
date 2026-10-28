import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listTeachers } from '@/server/services/teacher-service';
import { TeachersClient } from './TeachersClient';

export const metadata: Metadata = { title: 'Colaboradores' };

const TABS = [
  { key: 'professores', team: 'PROFESSOR', label: 'Professores', hint: 'Área fim · horistas com grade de aulas' },
  { key: 'escala', team: 'ESCALA', label: 'Equipe 5x2', hint: 'Área meio · escalas de trabalho mensais' },
] as const;

export default async function ColaboradoresPage({ searchParams }: { searchParams: Promise<{ time?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'teacher.view')) redirect('/hoje');
  const { time } = await searchParams;
  const tab = TABS.find((t) => t.key === time) ?? TABS[0];

  const [teachers, modalities, areas, positions, contractTypes] = await Promise.all([
    listTeachers(principal, { includeInactive: true }),
    prisma.modality.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, color: true, areaId: true } }),
    prisma.coordinationArea.findMany({ where: { deletedAt: null, active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.position.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.contractType.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ]);

  const count = (team: string) => teachers.filter((t) => t.team === team && t.active).length;

  return (
    <>
      <PageHeader
        title="Colaboradores"
        description={tab.team === 'PROFESSOR'
          ? 'Professores, instrutores e estagiários. As modalidades habilitadas alimentam a sugestão de substitutos.'
          : 'Recepção, limpeza, manutenção, lanchonete, cozinha e demais setores da escala 5x2.'}
      />
      <nav className="mb-5 flex gap-1 border-b border-borda" aria-label="Times">
        {TABS.map((t) => (
          <Link key={t.key} href={`/professores?time=${t.key}`} aria-current={t === tab ? 'page' : undefined}
            className={cn('-mb-px border-b-2 px-4 py-2.5 text-sm font-bold', t === tab ? 'border-nacao text-nacao' : 'border-transparent text-tinta-suave hover:text-tinta')}>
            {t.label} <span className="ml-1 rounded-full bg-fundo px-2 py-0.5 text-xs text-tinta-fraca">{count(t.team)}</span>
            <span className="block text-[11px] font-medium text-tinta-fraca">{t.hint}</span>
          </Link>
        ))}
      </nav>
      <TeachersClient
        key={tab.team}
        team={tab.team}
        teachers={teachers.filter((t) => t.team === tab.team)}
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
