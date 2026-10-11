import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { NotFoundError } from '@/server/errors';
import { getScheduleReview, listImports } from '@/server/services/mkt-import-service';
import { ScheduleImport } from './ScheduleImport';

export const metadata: Metadata = { title: 'Importar cronograma' };
// A leitura do documento chama a IA.
export const maxDuration = 300;

export default async function Page({ searchParams }: { searchParams: Promise<{ leitura?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.admin')) redirect('/marketing');
  const sp = await searchParams;
  const today = todayIso();
  const id = sp.leitura && /^[0-9a-f-]{36}$/i.test(sp.leitura) ? sp.leitura : null;
  const [review, imports] = await Promise.all([
    id ? getScheduleReview(principal, id, today).catch((e) => { if (e instanceof NotFoundError) return null; throw e; }) : null,
    listImports(principal),
  ]);
  return (
    <>
      <PageHeader title="Importar cronograma" description="Traga o cronograma de marketing (Google Docs) para o calendário: a IA separa eventos, campanhas, temas do mês e datas; sobe direto no calendário (ou passa pela sua revisão, se preferir)." />
      <ScheduleImport review={review} imports={imports} canAi={can(principal, 'mkt.ai')} />
    </>
  );
}
