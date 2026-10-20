import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { prisma } from '@/server/db';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { mktOptions } from '@/server/services/marketing-service';
import { AreasClient } from './AreasClient';
import { ColumnsClient } from './ColumnsClient';

export const metadata: Metadata = { title: 'Configurações do Marketing' };

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.admin')) redirect('/marketing');
  const [options, counts] = await Promise.all([
    mktOptions(),
    prisma.mktTask.groupBy({ by: ['columnId'], _count: { _all: true } }),
  ]);
  return (
    <>
      <PageHeader title="Configurações do Marketing" description="Responsáveis de cada área e as colunas do Kanban." />
      <h2 className="mb-1 text-lg font-bold text-navy">Responsáveis por área</h2>
      <p className="mb-3 text-sm text-tinta-suave">Toda tarefa nova da área já nasce com o responsável principal e os corresponsáveis marcados (dá para mudar em cada tarefa).</p>
      <AreasClient areas={options.areas} people={options.people} />
      <h2 className="mb-1 mt-8 text-lg font-bold text-navy">Colunas do Kanban</h2>
      <p className="mb-3 text-sm text-tinta-suave">Renomeie, mude a cor, reordene, crie ou exclua colunas para o quadro ficar do jeito do time.</p>
      <ColumnsClient columns={options.columns} counts={Object.fromEntries(counts.filter((c) => c.columnId).map((c) => [c.columnId!, c._count._all]))} />
    </>
  );
}
