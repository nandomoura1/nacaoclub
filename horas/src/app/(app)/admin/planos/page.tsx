import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TABLE_STATUS, type TableStatus } from '@/domain/planos';
import { cn } from '@/lib/cn';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listPlanTables, planTable } from '@/server/services/planos-service';
import { ImportButton, PlanBoard } from './PlanBoard';

export const metadata: Metadata = { title: 'Planos Nação' };

export default async function Page({ searchParams }: { searchParams: Promise<{ tabela?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'plans.view')) redirect('/hoje');
  const edit = can(principal, 'plans.edit');
  const sp = await searchParams;
  const tables = await listPlanTables(principal);
  // Padrão: o rascunho mais recente para quem edita; a vigente para quem consulta.
  const chosen = tables.find((t) => t.id === sp.tabela) ?? (edit ? tables.find((t) => t.status === 'RASCUNHO') : null) ?? tables.find((t) => t.status === 'VIGENTE') ?? tables[0];
  const view = chosen ? await planTable(principal, chosen.id) : null;

  return (
    <>
      <PageHeader
        title="Planos Nação"
        description="Planos, modalidades e preços da Nação por ano. A tabela vigente fica travada; a do ano seguinte é montada num rascunho — incluir, simplificar, tirar planos e reajustar os preços plano a plano, comparando com a vigente."
      />
      {tables.length > 0 && (
        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-borda">
          {tables.map((t) => (
            <Link key={t.id} href={`/admin/planos?tabela=${t.id}`}
              className={cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold', t.id === chosen?.id ? 'border-nacao text-nacao' : 'border-transparent text-tinta-suave hover:text-tinta')}>
              {t.name}
              <Badge tone={t.status === 'VIGENTE' ? 'green' : t.status === 'RASCUNHO' ? 'amber' : 'neutral'}>{TABLE_STATUS[t.status as TableStatus] ?? t.status}</Badge>
            </Link>
          ))}
        </div>
      )}
      {!view ? (
        <Card className="space-y-3 p-8 text-center text-sm text-tinta-suave">
          <p>Nenhuma tabela de planos ainda.</p>
          {edit ? <ImportButton /> : <p>O Administrador ainda não montou a tabela.</p>}
        </Card>
      ) : (
        <PlanBoard view={view} canEdit={edit} />
      )}
    </>
  );
}
