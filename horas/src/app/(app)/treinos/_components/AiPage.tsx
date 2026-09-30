import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/card';
import { addDays, formatDateBR, weekdayOf } from '@/domain/dates';
import { PROGRAM_KINDS } from '@/domain/programming/ai-program';
import { programModality } from '@/domain/programming/modalities';
import { todayIso } from '@/lib/today';
import { cn } from '@/lib/cn';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { aiEnabled } from '@/server/ai/workout-generator';
import { listPrograms } from '@/server/ai/program-generator';
import { AiGenerator } from './AiGenerator';
import { ProgramForm } from './ProgramForm';

export async function AiPage({ slug, mode }: { slug: string; mode?: string }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'workout.edit')) redirect('/hoje');
  const m = programModality(slug);
  const planilha = mode === 'planilha';
  const today = todayIso();
  const nextMonday = addDays(today, ((8 - weekdayOf(today)) % 7) || 7);
  const programs = planilha ? await listPrograms(principal, slug) : [];
  const tab = (on: boolean) => cn('rounded-full border px-4 py-2 text-sm font-bold', on ? 'border-navy bg-navy text-white' : 'border-borda text-tinta hover:bg-fundo');
  return (
    <>
      <PageHeader
        title={`Geração de Treino IA · ${m.name}`}
        description={`O copiloto usa o DNA de ${m.name}, as lacunas e os últimos 14 ou 30 dias de treinos da Nação. O motor confere tempo de aula, volume e fadiga; o coach revisa e lança no Cadastro de Treino.`}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={`/treinos/${slug}/ia`} className={tab(!planilha)}>Treino do dia</Link>
        <Link href={`/treinos/${slug}/ia?modo=planilha`} className={tab(planilha)}>Planilha · curto, médio e longo prazo</Link>
      </div>
      {planilha ? (
        <>
          <ProgramForm slug={slug} defaultStart={nextMonday} enabled={aiEnabled()} />
          <h2 className="mb-2 mt-6 text-xl font-extrabold text-navy">Planilhas salvas</h2>
          {programs.length === 0 ? (
            <Card className="p-4 text-sm text-tinta-suave">Nenhuma planilha ainda.</Card>
          ) : (
            <Card className="divide-y divide-borda">
              {programs.map((p) => (
                <Link key={p.id} href={`/treinos/${slug}/ia/planilha/${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm hover:bg-fundo">
                  <span className="font-bold text-navy">{p.title}</span>
                  <span className="text-tinta-suave">{PROGRAM_KINDS.find((k) => k.id === p.kind)?.label}</span>
                  <span className="text-tinta-suave">{formatDateBR(p.startDate)} a {formatDateBR(p.endDate)}</span>
                  <span className="flex-1" />
                  <span className="font-semibold tabular-nums text-tinta">{p.generated}/{p.total} aulas geradas</span>
                </Link>
              ))}
            </Card>
          )}
        </>
      ) : (
        <AiGenerator slug={slug} modality={m.name} defaultDate={addDays(today, 1)} enabled={aiEnabled()} />
      )}
    </>
  );
}
