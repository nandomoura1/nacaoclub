import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { programModality } from '@/domain/programming/modalities';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listBenchmarks } from '@/server/services/benchmark-service';
import { BenchmarksClient } from './BenchmarksClient';

const DESCRIPTION: Record<string, string> = {
  crossfit: 'Girls, Heroes e clássicos do CrossFit, com cargas Rx em kg, e os benchmarks da própria Nação. No Cadastro de Treino, o botão + Benchmark joga o WOD direto no dia.',
};

export async function BenchmarksPage({ slug }: { slug: string }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'workout.edit')) redirect('/hoje');
  const m = programModality(slug);
  const items = await listBenchmarks(principal, { includeInactive: true, modality: slug });
  return (
    <>
      <PageHeader
        title={`Benchmarks · ${m.name}`}
        description={DESCRIPTION[slug] ?? `Treinos de referência de ${m.name}: testes, simulados e circuitos que se repetem para medir evolução. No Cadastro de Treino, o botão + Benchmark joga o treino direto no dia.`}
      />
      <BenchmarksClient items={items} modality={{ slug, name: m.name }} />
    </>
  );
}
