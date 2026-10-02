import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/card';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { AuthorizationError, NotFoundError } from '@/server/errors';
import { getPersonalWorkout, personalSlots } from '@/server/services/personal-workout-service';
import { PersonalEditor } from './PersonalEditor';

export const metadata: Metadata = { title: 'Treino Personal' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'workout.personal')) redirect('/hoje');
  const { id } = await params;
  const isNew = id === 'novo';
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const all = can(principal, 'workout.edit');
  if (!all && !principal.teacherId) redirect('/treinos/personal');
  const today = todayIso();
  const [workout, slots, teachers] = await Promise.all([
    isNew ? null : getPersonalWorkout(principal, id).catch((e) => { if (e instanceof NotFoundError || e instanceof AuthorizationError) notFound(); throw e; }),
    personalSlots(principal, today),
    all ? prisma.teacher.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  return (
    <>
      <Link href="/treinos/personal" className="mb-3 inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-nacao"><ArrowLeft className="size-4" /> Treinos Personal</Link>
      <PageHeader title={isNew ? 'Novo treino Personal' : workout!.title} description="Escolha a aula de Personal, a data e monte os blocos do treino. Depois é só mandar para o aluno." />
      <PersonalEditor workout={workout} slots={slots} today={today} teachers={teachers} myTeacherId={principal.teacherId} all={all} />
    </>
  );
}
