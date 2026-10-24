import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { prisma } from '@/server/db';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { todayIso } from '@/lib/today';
import { NoticeArtClient } from './NoticeArtClient';

export const metadata: Metadata = { title: 'Gerador de comunicados' };

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const modalities = await prisma.modality.findMany({ where: { active: true }, select: { name: true }, orderBy: { name: 'asc' } });
  const places = [...new Set(['Academia', 'Lanchonete', 'Day Use', 'Recepção', 'Piscina', 'Nação Kids', ...modalities.map((m) => m.name)])];
  return (
    <>
      <PageHeader title="Gerador de comunicados" description="Preencha data, horários e locais: o criativo sai pronto no padrão da Nação (story ou feed), para baixar e postar." />
      <NoticeArtClient places={places} today={todayIso()} />
    </>
  );
}
