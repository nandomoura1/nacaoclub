import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/card';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listTimerScreens } from '@/server/services/tv-service';
import { TimerRemote } from './TimerRemote';

export const metadata: Metadata = { title: 'Cronômetro da TV' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ tela?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'workout.tv_timer')) redirect('/hoje');
  const screens = await listTimerScreens(principal, todayIso());
  const { tela } = await searchParams;
  return (
    <>
      <PageHeader title="Cronômetro da TV" description="Programe o timer da aula pelo celular: a TV do box mostra o WOD e o cronômetro em tempo real." />
      {screens.length === 0 ? (
        <Card className="p-6 text-sm text-tinta-suave">
          Nenhuma TV cadastrada ainda. {can(principal, 'workout.edit') ? <Link href="/treinos/tv" className="font-semibold text-nacao">Cadastre a TV do box em Telas de TV</Link> : 'Peça à coordenação para cadastrar a TV em Treinos → Telas de TV.'}
        </Card>
      ) : (
        <TimerRemote screens={screens} initialId={screens.some((s) => s.id === tela) ? tela! : screens[0]!.id} />
      )}
    </>
  );
}
