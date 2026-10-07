import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { isMonth, monthLabel, type Month } from '@/domain/condominio/months';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { NotFoundError } from '@/server/errors';
import { getFinVersion } from '@/server/services/fin-service';
import { ReportView } from '../../../../_components/ReportView';
import { PrintButton } from './PrintButton';

export const metadata: Metadata = { title: 'Versão do Relatório Financeiro' };

/** Uma versão aprovada, exatamente como foi congelada (números, análise e observações). */
export default async function Page({ params, searchParams }: { params: Promise<{ mes: string; n: string }>; searchParams: Promise<{ visao?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'fin.view')) redirect('/hoje');
  const { mes, n } = await params;
  const { visao } = await searchParams;
  if (!isMonth(mes) || !/^\d{1,4}$/.test(n)) notFound();
  const v = await getFinVersion(principal, mes, Number(n)).catch((e) => { if (e instanceof NotFoundError) return null; throw e; });
  if (!v) notFound();
  const s = v.snapshot;
  const mode = visao === 'socios' ? 'socios' : 'completo';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/financeiro/competencias/${mes}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}><ArrowLeft /> {monthLabel(mes as Month)}</Link>
        <span className="text-sm text-tinta-suave">Versão {v.number} · {new Date(v.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{v.reason ? ` · “${v.reason}”` : ''}</span>
        <span className="flex-1" />
        <Link href={`?visao=${mode === 'socios' ? 'completo' : 'socios'}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{mode === 'socios' ? 'Relatório completo' : 'Visão dos sócios'}</Link>
        <PrintButton />
      </div>
      <div>
        <ReportView month={mes} m={s.metrics} analysis={s.analysis} previous={null} managerNotes={s.managerNotes} partnerDecisions={s.partnerDecisions} mode={mode} version={v.number} />
      </div>
    </div>
  );
}
