import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { holidayBoard } from '@/server/services/ws-service';
import { todayIso } from '@/lib/today';
import { HolidaysClient } from './HolidaysClient';

export const metadata: Metadata = { title: 'Feriados — Escalas 5x2' };

export default async function FeriadosPage() {
  const principal = await requirePrincipal();
  if (!can(principal, 'ws.view')) redirect('/hoje');
  const board = await holidayBoard(principal, todayIso());
  return (
    <>
      <PageHeader
        title="Feriados"
        description="Regra básica da Nação: no feriado, cada setor funciona como no sábado. Aqui você define o que é diferente em cada setor e, feriado a feriado, confirma ou ajusta o horário antes de gerar a escala."
      />
      <HolidaysClient board={board} />
    </>
  );
}
