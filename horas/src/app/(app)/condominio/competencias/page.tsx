import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, PageHeader } from '@/components/ui/card';
import { formatDateBR } from '@/domain/dates';
import { formatBRL } from '@/domain/condominio/money';
import { monthLabel, monthLong } from '@/domain/condominio/months';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listPeriods, nextMonthToOpen } from '@/server/services/condo-period-service';
import { OpenPeriod } from './OpenPeriod';

export const metadata: Metadata = { title: 'Competências do condomínio' };

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'condo.view')) redirect('/hoje');
  const today = todayIso();
  const [rows, suggested, centers] = await Promise.all([listPeriods(principal), nextMonthToOpen(today), prisma.condoCenter.count()]);
  const opened = rows.some((r) => r.month === suggested);
  return (
    <>
      <PageHeader title="Competências e cobranças" description="Cada mês vencido vira uma competência: lance as despesas, as leituras de energia e os alunos, confira as cobranças e feche para gerar os documentos." />
      {can(principal, 'condo.edit') && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
          <div className="flex-1 text-sm">
            <b className="text-navy">{opened ? 'Abrir outra competência' : `Próxima: ${monthLong(suggested)}`}</b>
            <p className="text-tinta-suave">{centers ? 'Abre copiando a anterior (despesas, alunos, itens, tarifa e bandeira).' : <>Comece importando a planilha em <Link href="/condominio/cadastros?aba=importar" className="font-semibold text-nacao hover:underline">Cadastros → Importar planilha</Link>.</>}</p>
          </div>
          {centers > 0 && <OpenPeriod suggested={suggested} />}
        </Card>
      )}
      <Card className="divide-y divide-borda">
        {rows.length === 0 && <p className="p-4 text-sm text-tinta-suave">Nenhuma competência ainda.</p>}
        {rows.map((r) => (
          <Link key={r.month} href={`/condominio/competencias/${r.month}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 p-3 text-sm hover:bg-fundo sm:grid-cols-[8rem_minmax(0,1fr)_9rem_9rem_7rem_auto]">
            <span className="font-extrabold text-navy">{monthLabel(r.month)}</span>
            <span className="flex flex-wrap items-center gap-1">
              {r.status === 'CLOSED' ? <Badge tone="green"><Lock className="size-3" /> Fechada</Badge> : <Badge tone="amber">Em lançamento</Badge>}
              {r.imported && <Badge tone="neutral">planilha</Badge>}
              <span className="text-xs text-tinta-suave">vence {formatDateBR(r.dueDate)}</span>
            </span>
            <span className="hidden text-right tabular-nums text-tinta-suave sm:block">desp. {formatBRL(r.expensesCents)}</span>
            <span className="hidden text-right font-semibold tabular-nums text-navy sm:block">{r.charges ? formatBRL(r.chargesCents) : '—'}</span>
            <span className="hidden text-right text-xs text-tinta-suave sm:block">{r.charges ? `${r.paid}/${r.charges} pagas` : ''}</span>
            <ChevronRight className="size-4 text-tinta-fraca" />
          </Link>
        ))}
      </Card>
    </>
  );
}
