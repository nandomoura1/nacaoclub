import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listBenchmarks } from '@/server/services/benchmark-service';
import { BenchmarksClient } from './BenchmarksClient';

export const metadata: Metadata = { title: 'Benchmarks' };

export default async function BenchmarksPage() {
  const principal = await requirePrincipal();
  if (!can(principal, 'workout.edit')) redirect('/hoje');
  const items = await listBenchmarks(principal, { includeInactive: true });
  return (
    <>
      <PageHeader
        title="Benchmarks"
        description="Girls, Heroes e clássicos do CrossFit, com cargas Rx em kg, e os benchmarks da própria Nação. No Cadastro de Treino, o botão + Benchmark joga o WOD direto no dia."
      />
      <BenchmarksClient items={items} />
    </>
  );
}
