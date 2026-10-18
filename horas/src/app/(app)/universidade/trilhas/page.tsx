import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { eduLibrary } from '@/server/services/edu-service';
import { TracksClient } from './TracksClient';

export const metadata: Metadata = { title: 'Trilhas · Universidade Nação' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'edu.view')) redirect('/hoje');
  const [lib, roles, h] = await Promise.all([
    eduLibrary(principal),
    prisma.role.findMany({ select: { key: true, name: true }, orderBy: { name: 'asc' } }),
    headers(),
  ]);
  const base = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  return (
    <>
      <PageHeader title="Trilhas de capacitação" description="Sequências de materiais para estudar em ordem — começando pelo Onboarding do Colaborador Nação. O progresso de cada um aparece aqui e para o gestor em “Quem concluiu”." />
      <TracksClient lib={lib} roles={roles} base={base} perms={{ edit: can(principal, 'edu.edit'), admin: can(principal, 'edu.admin'), whatsapp: can(principal, 'whatsapp.send') }} />
    </>
  );
}
