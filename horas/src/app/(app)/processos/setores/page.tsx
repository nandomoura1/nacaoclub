import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listSectors, procPeople } from '@/server/services/proc-service';
import { SectorsClient } from './SectorsClient';

export const metadata: Metadata = { title: 'Setores e líderes' };

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'proc.admin')) redirect('/processos');
  const [sectors, people] = await Promise.all([listSectors(principal), procPeople()]);
  return (
    <>
      <PageHeader title="Setores e líderes" description="Quem responde por cada setor. O líder precisa do perfil “Líder de setor” (Administração → Usuários) para ver e atualizar as demandas." />
      <SectorsClient sectors={sectors} people={people} />
    </>
  );
}
