import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { procPeople } from '@/server/services/proc-service';
import { listAtas } from '@/server/services/proc-meeting-service';
import { AtasClient } from './AtasClient';

export const metadata: Metadata = { title: 'Atas de reunião' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'proc.view')) redirect('/hoje');
  const admin = can(principal, 'proc.admin');
  const [atas, people, sectors] = await Promise.all([
    listAtas(principal),
    procPeople(),
    prisma.procSector.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, leaderId: true } }),
  ]);
  // Demanda nascida da ata: diretoria em qualquer setor; líder nos seus.
  const openable = sectors.filter((s) => admin || (can(principal, 'proc.edit') && s.leaderId === principal.id)).map((s) => ({ id: s.id, name: s.name }));
  return (
    <>
      <PageHeader title="Atas de reunião" description="O registro das reuniões (online ou presenciais): data, quem participou, resumo da pauta e decisões — e as demandas que saíram de cada uma, acompanhadas até a entrega." />
      <AtasClient atas={atas} people={people.map((p) => ({ id: p.id, name: p.name }))} sectors={openable} today={todayIso()}
        perms={{ create: admin || can(principal, 'proc.edit'), del: admin }} />
    </>
  );
}
