import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { eduLibrary } from '@/server/services/edu-service';
import { EduLibraryClient } from './EduLibraryClient';

export const metadata: Metadata = { title: 'Universidade Nação' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ area?: string; novo?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'edu.view')) redirect('/hoje');
  const sp = await searchParams;
  const [lib, roles] = await Promise.all([
    eduLibrary(principal),
    prisma.role.findMany({ select: { key: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return (
    <>
      <PageHeader title="Universidade Nação" description="Os materiais de capacitação da Nação num lugar só: onboarding, manual, checklists, e-books e audiobooks — da área técnica e da gestão. Abra, estude e marque “Concluí”." />
      <EduLibraryClient lib={lib} roles={roles} initialArea={sp.area ?? 'ESSENCIAL'} openNew={sp.novo === '1'}
        perms={{ edit: can(principal, 'edu.edit'), admin: can(principal, 'edu.admin') }} />
    </>
  );
}
