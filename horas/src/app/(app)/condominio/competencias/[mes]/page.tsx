import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { NotFoundError } from '@/server/errors';
import { isMonth, monthLabel } from '@/domain/condominio/months';
import { getPeriod } from '@/server/services/condo-period-service';
import { getCondoSettings } from '@/server/services/condo-service';
import { PeriodClient } from './PeriodClient';

export async function generateMetadata({ params }: { params: Promise<{ mes: string }> }): Promise<Metadata> {
  const { mes } = await params;
  return { title: isMonth(mes) ? `Condomínio ${monthLabel(mes)}` : 'Condomínio' };
}

export default async function Page({ params }: { params: Promise<{ mes: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'condo.view')) redirect('/hoje');
  const { mes } = await params;
  if (!isMonth(mes)) notFound();
  const [p, settings] = await Promise.all([
    getPeriod(principal, mes).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; }),
    getCondoSettings(),
  ]);
  return <PeriodClient key={p.month} p={p} settings={settings} canEdit={can(principal, 'condo.edit')} canClose={can(principal, 'condo.close')} canPay={can(principal, 'condo.payments')} />;
}
