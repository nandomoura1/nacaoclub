import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { addDays } from '@/domain/dates';
import { programModality } from '@/domain/programming/modalities';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { aiEnabled } from '@/server/ai/workout-generator';
import { AiGenerator } from './AiGenerator';

export async function AiPage({ slug }: { slug: string }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'workout.edit')) redirect('/hoje');
  const m = programModality(slug);
  return (
    <>
      <PageHeader
        title={`Geração de Treino IA · ${m.name}`}
        description={`O copiloto propõe a aula do dia a partir do DNA de ${m.name}, das lacunas e do que já foi programado nos últimos 14 dias. O motor confere tempo de aula, volume e fadiga; o coach revisa e lança no Cadastro de Treino.`}
      />
      <AiGenerator slug={slug} modality={m.name} defaultDate={addDays(todayIso(), 1)} enabled={aiEnabled()} />
    </>
  );
}
