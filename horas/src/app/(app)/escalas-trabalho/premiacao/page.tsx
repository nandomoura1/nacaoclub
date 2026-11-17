import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { todayIso } from '@/lib/today';
import { awardBoard } from '@/server/services/premiacao-service';
import { AwardClient } from './AwardClient';

export const metadata: Metadata = { title: 'Premiação — Escalas 5x2' };

/** Mês padrão: até o dia 15, o mês anterior (ainda a pagar); depois, o mês corrente (em avaliação). */
function defaultMonth(today: string) {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  if (d > 15) return `${y}-${String(m).padStart(2, '0')}`;
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export default async function PremiacaoPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'award.view')) redirect('/hoje');
  const sp = await searchParams;
  const mes = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : defaultMonth(todayIso());
  const board = await awardBoard(principal, mes);
  return (
    <>
      <PageHeader
        title="Premiação"
        description="Gratificação mensal (até R$ 300) paga no dia 15 do mês seguinte: Produtividade (tarefas e checklists), Pontualidade (atraso de mais de 15 min perde) e Assiduidade (falta ou atestado perde). Falta sem justificativa perde as três."
      />
      <AwardClient key={mes} board={board} />
    </>
  );
}
