import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, PageHeader } from '@/components/ui/card';
import { formatDateBR } from '@/domain/dates';
import { mondayOf } from '@/domain/workout';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listWeeks, workoutModalities } from '@/server/services/workout-service';
import { NewWeekForm } from './NewWeekForm';

export const metadata: Metadata = { title: 'Cadastro de Treino' };

export default async function TreinosPage() {
  const principal = await requirePrincipal();
  const canEdit = can(principal, 'workout.edit');
  if (!canEdit && !can(principal, 'workout.view')) redirect('/hoje');
  const [weeks, modalities] = await Promise.all([listWeeks(principal), canEdit ? workoutModalities(principal) : Promise.resolve([])]);
  const today = todayIso();
  const nextMonday = mondayOf(today) === today ? today : (() => { const d = new Date(`${mondayOf(today)}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 7); return d.toISOString().slice(0, 10); })();

  return (
    <>
      <PageHeader
        title="Cadastro de Treino"
        description={canEdit
          ? 'Lance os treinos da semana e gere o plano de aula (PDF professores), o resumo dos alunos (PDF), a arte em JPG no padrão Nação e o texto para os grupos de WhatsApp. Módulo à parte: não mexe na grade nem nas horas.'
          : 'Os treinos da semana de cada modalidade, para você preparar a aula: abra a semana para ver os treinos, o PDF do professor e a arte.'}
      />
      {canEdit && <NewWeekForm modalities={modalities} defaultDate={nextMonday} />}
      {can(principal, 'workout.personal') && (
        <Link href="/treinos/personal" className="mt-4 flex items-center gap-2 rounded-xl border border-nacao/30 bg-nacao/5 p-4 text-sm font-semibold text-nacao hover:border-nacao">
          Treinos Personal: monte o treino de uma aula de Personal sua →
        </Link>
      )}
      <Card className="mt-4 divide-y divide-borda">
        {weeks.length === 0 && <p className="p-6 text-sm text-tinta-suave">Nenhum treino lançado ainda. Comece criando a semana acima.</p>}
        {weeks.map((w) => (
          <Link key={w.id} href={`/treinos/${w.id}`} className="flex items-center gap-3 p-4 hover:bg-fundo">
            <span className="size-3 shrink-0 rounded-full" style={{ background: w.color }} />
            <span className="font-bold text-tinta">{w.modality}</span>
            <span className="text-sm text-tinta-suave">semana de {formatDateBR(w.weekStart)}</span>
            <div className="flex-1" />
            <Badge tone={w.blocks ? 'blue' : 'neutral'}>{w.blocks ? `${w.days} dia(s) · ${w.blocks} bloco(s)` : 'vazia'}</Badge>
          </Link>
        ))}
      </Card>
    </>
  );
}
