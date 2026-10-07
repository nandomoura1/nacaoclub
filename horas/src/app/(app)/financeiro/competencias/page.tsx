import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, PageHeader } from '@/components/ui/card';
import { monthLabel, suggestedMonth } from '@/domain/condominio/months';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listFinPeriods } from '@/server/services/fin-service';
import { FIN_STATUS } from '../_components/fmt';
import { NewPeriod } from './NewPeriod';

export const metadata: Metadata = { title: 'Relatório Financeiro' };

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'fin.view')) redirect('/hoje');
  const rows = await listFinPeriods(principal);
  return (
    <>
      <PageHeader title="Relatório Financeiro" description="Um relatório por mês: envie os documentos, confira o que o sistema leu, aprove e gere o relatório. Cada aprovação vira uma versão guardada." />
      {can(principal, 'fin.edit') && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
          <div className="flex-1 text-sm">
            <b className="text-navy">Novo relatório</b>
            <p className="text-tinta-suave">Escolha o mês. Meses antigos que já têm relatório pronto entram por <Link href="/financeiro/importar" className="font-semibold text-nacao hover:underline">Importar relatórios antigos</Link>.</p>
          </div>
          <NewPeriod suggested={suggestedMonth(todayIso())} />
        </Card>
      )}
      <Card className="divide-y divide-borda">
        {rows.length === 0 && <p className="p-4 text-sm text-tinta-suave">Nenhum relatório ainda.</p>}
        {rows.map((r) => (
          <Link key={r.month} href={`/financeiro/competencias/${r.month}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 p-3 text-sm hover:bg-fundo sm:grid-cols-[8rem_minmax(0,1fr)_10rem_auto]">
            <span className="font-extrabold text-navy">{monthLabel(r.month)}</span>
            <span className="flex flex-wrap items-center gap-1">
              <Badge tone={FIN_STATUS[r.status]?.tone}>{FIN_STATUS[r.status]?.label ?? r.status}</Badge>
              {r.version > 0 && <Badge tone="navy">v{r.version}</Badge>}
              {r.pending > 0 && <Badge tone="amber">{r.pending} para conferir</Badge>}
            </span>
            <span className="hidden text-right text-xs text-tinta-suave sm:block">{r.documents} doc. · {r.lines} dados</span>
            <ChevronRight className="size-4 text-tinta-fraca" />
          </Link>
        ))}
      </Card>
    </>
  );
}
