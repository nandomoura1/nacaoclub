import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/card';
import { programModality } from '@/domain/programming/modalities';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { NotFoundError } from '@/server/errors';
import { aiEnabled } from '@/server/ai/workout-generator';
import { getProgram } from '@/server/ai/program-generator';
import { ProgramView } from './ProgramView';

export async function ProgramPage({ slug, id }: { slug: string; id: string }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'workout.edit')) redirect('/hoje');
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const program = await getProgram(principal, id).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  if (program.modality !== slug) notFound();
  const m = programModality(slug);
  return (
    <>
      <Link href={`/treinos/${slug}/ia?modo=planilha`} className="mb-3 inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-nacao"><ArrowLeft className="size-4" /> Planilhas</Link>
      <PageHeader title={program.title} description={`Planilha de ${m.name} gerada pela IA. Gere as aulas semana a semana, confira e lance no Cadastro de Treino.`} />
      <ProgramView program={program} slug={slug} modality={m.name} enabled={aiEnabled()} />
    </>
  );
}
