import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { DnaReport, dnaRange } from '../../_components/DnaReport';

export const metadata: Metadata = { title: 'DNA da Programação · Funcional' };

export default async function Page({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'workout.edit')) redirect('/hoje');
  return <DnaReport slug="funcional" range={dnaRange(await searchParams)} />;
}
