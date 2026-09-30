import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { addDays, formatDateBR } from '@/domain/dates';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { NotFoundError } from '@/server/errors';
import { getWeek } from '@/server/services/workout-service';
import { listBenchmarks } from '@/server/services/benchmark-service';
import { modalitySlug } from '@/domain/programming/modalities';
import { EditorClient } from './EditorClient';

export const metadata: Metadata = { title: 'Treinos da semana' };

export default async function SemanaPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'workout.edit')) redirect('/hoje');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const week = await getWeek(principal, id).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  // O botão + Benchmark mostra a biblioteca da modalidade da semana.
  const benchmarks = await listBenchmarks(principal, { modality: modalitySlug(week.modality) });

  return (
    <>
      <Link href="/treinos" className="mb-3 inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-nacao"><ArrowLeft className="size-4" /> Cadastro de Treino</Link>
      <h1 className="text-2xl font-extrabold text-navy">{week.modality} · semana de {formatDateBR(week.weekStart)} a {formatDateBR(addDays(week.weekStart, 6))}</h1>
      <p className="mb-4 mt-1 text-sm text-tinta-suave">
        Para o aluno (arte, texto e PDF alunos), mobilidade, warm-up e core saem só com o tempo; <b>força</b>, <b>técnica</b> e <b>WOD</b> saem detalhados. O <b>PDF professores</b> leva o roteiro completo de cada etapa e as orientações ao professor.
      </p>
      <EditorClient key={week.id} week={week} benchmarks={benchmarks} />
    </>
  );
}
