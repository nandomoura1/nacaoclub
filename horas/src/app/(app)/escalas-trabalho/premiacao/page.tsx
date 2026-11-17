import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { todayIso } from '@/lib/today';
import { currentAwardMonth } from '@/domain/premiacao';
import { awardBoard } from '@/server/services/premiacao-service';
import { AwardClient } from './AwardClient';

export const metadata: Metadata = { title: 'Premiação — Escalas 5x2' };

export default async function PremiacaoPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'award.view')) redirect('/hoje');
  const sp = await searchParams;
  const mes = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : currentAwardMonth(todayIso());
  const board = await awardBoard(principal, mes);
  return (
    <>
      <PageHeader
        title="Premiação"
        description="Gratificação mensal (até R$ 300): competência do dia 15 ao dia 14 do mês seguinte, paga no dia 15. Produtividade (tarefas e checklists), Pontualidade (atraso de mais de 15 min perde) e Assiduidade (falta ou atestado perde). Falta sem justificativa perde as três."
      />
      <AwardClient key={mes} board={board} />
    </>
  );
}
