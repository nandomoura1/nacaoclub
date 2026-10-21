import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listScreens } from '@/server/services/tv-service';
import { workoutModalities } from '@/server/services/workout-service';
import { ScreensClient } from './ScreensClient';

export const metadata: Metadata = { title: 'Telas de TV' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'workout.edit')) redirect('/treinos');
  const h = await headers();
  const base = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const [screens, modalities] = await Promise.all([listScreens(principal), workoutModalities(principal)]);
  return (
    <>
      <PageHeader title="Telas de TV" description="Cada TV do box ganha um link fixo: abra uma vez no navegador da TV e ela mostra sozinha o treino do dia da modalidade — atualiza a cada minuto, sem login." />
      <ScreensClient screens={screens} modalities={modalities} base={base} today={todayIso()} />
    </>
  );
}
