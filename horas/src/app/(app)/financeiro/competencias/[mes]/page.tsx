import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isMonth, monthLabel } from '@/domain/condominio/months';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { NotFoundError } from '@/server/errors';
import { getFinPeriod, listCategories } from '@/server/services/fin-service';
import { PeriodClient } from './PeriodClient';

// Processar documentos e gerar a análise chamam a IA (até alguns minutos).
export const maxDuration = 300;

export async function generateMetadata({ params }: { params: Promise<{ mes: string }> }): Promise<Metadata> {
  const { mes } = await params;
  return { title: isMonth(mes) ? `Relatório Financeiro ${monthLabel(mes)}` : 'Relatório Financeiro' };
}

export default async function Page({ params }: { params: Promise<{ mes: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'fin.view')) redirect('/hoje');
  const { mes } = await params;
  if (!isMonth(mes)) notFound();
  const p = await getFinPeriod(principal, mes).catch((e) => { if (e instanceof NotFoundError) return null; throw e; });
  if (!p) notFound();
  const categories = (await listCategories()).map((c) => ({ key: c.key, label: c.label, kind: c.kind, active: c.active }));
  return (
    <PeriodClient p={p} categories={categories}
      perms={{ canImport: can(principal, 'fin.import'), canEdit: can(principal, 'fin.edit'), canApprove: can(principal, 'fin.approve') }} />
  );
}
