import Link from 'next/link';
import { ArrowLeft, FileText, Image as ImageIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { WEEKDAYS, addDays, formatDateBR, weekdayOf } from '@/domain/dates';
import { KIND } from '@/domain/workout';
import type { WorkoutWeekView } from '@/server/services/workout-service';

/** Semana de treinos em modo leitura (perfil Professor): ver para preparar a aula. */
export function WeekReadOnly({ week }: { week: WorkoutWeekView }) {
  const days = week.days.filter((d) => d.blocks.length);
  return (
    <>
      <Link href="/treinos" className="mb-3 inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-nacao"><ArrowLeft className="size-4" /> Cadastro de Treino</Link>
      <h1 className="text-2xl font-extrabold text-navy">{week.modality} · semana de {formatDateBR(week.weekStart)} a {formatDateBR(addDays(week.weekStart, 6))}</h1>
      <div className="my-4 flex flex-wrap gap-2">
        <a href={`/treinos/${week.id}/pdf?tipo=professor`} target="_blank" rel="noopener" className={buttonVariants({ variant: 'secondary' })}><FileText /> PDF professores</a>
        <a href={`/treinos/${week.id}/pdf?tipo=aluno`} target="_blank" rel="noopener" className={buttonVariants({ variant: 'secondary' })}><FileText /> PDF alunos</a>
        <a href={`/treinos/${week.id}/arte`} target="_blank" rel="noopener" className={buttonVariants({ variant: 'secondary' })}><ImageIcon /> Arte</a>
      </div>
      {days.length === 0 && <Card className="p-6 text-sm text-tinta-suave">Nenhum treino lançado nesta semana ainda.</Card>}
      <div className="grid gap-3 lg:grid-cols-2">
        {days.map((d) => (
          <Card key={d.date} className="p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-nacao">{WEEKDAYS[weekdayOf(d.date) - 1]!.long} · {formatDateBR(d.date)}</p>
            {d.title && <h2 className="text-lg font-extrabold text-navy">{d.title}</h2>}
            <div className="mt-2 space-y-3">
              {d.blocks.map((b, i) => (
                <div key={i} className="border-l-4 border-nacao/30 pl-3">
                  <p className="text-sm"><b className="text-navy">{KIND[b.kind]?.label ?? b.kind}</b>{b.durationMin ? ` · ${b.durationMin}'` : ''}{b.title ? ` · ${b.title}` : ''}</p>
                  {b.format && <p className="text-sm font-semibold text-tinta">{b.format}{b.timeCapMin ? ` · cap ${b.timeCapMin}'` : ''}</p>}
                  {b.content && <p className="whitespace-pre-line text-sm text-tinta">{b.content}</p>}
                  {b.notes && <p className="whitespace-pre-line text-sm text-tinta-suave">{b.notes}</p>}
                  {b.coachNotes && <p className="mt-1 whitespace-pre-line rounded bg-fundo p-2 text-xs text-tinta"><b>Professor:</b> {b.coachNotes}</p>}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
