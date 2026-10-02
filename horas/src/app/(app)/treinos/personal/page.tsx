import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { WEEKDAYS, formatClock, formatDateBR, weekdayOf } from '@/domain/dates';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listPersonalWorkouts, personalSlots } from '@/server/services/personal-workout-service';

export const metadata: Metadata = { title: 'Treinos Personal' };

export default async function PersonalPage() {
  const principal = await requirePrincipal();
  if (!can(principal, 'workout.personal')) redirect('/hoje');
  const all = can(principal, 'workout.edit');
  if (!all && !principal.teacherIds.length) {
    return (
      <>
        <PageHeader title="Treinos Personal" description="Monte o treino de cada aula de Personal sua." />
        <Card className="p-6 text-sm"><b className="text-navy">Seu usuário ainda não está ligado ao seu cadastro de professor.</b> Peça à coordenação para fazer o vínculo em Administração → Usuários.</Card>
      </>
    );
  }
  const today = todayIso();
  const [items, slots] = await Promise.all([listPersonalWorkouts(principal), personalSlots(principal, today)]);
  const next = items.filter((w) => w.date >= today).reverse();
  const past = items.filter((w) => w.date < today);
  const row = (w: (typeof items)[number]) => (
    <Link key={w.id} href={`/treinos/personal/${w.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm hover:bg-fundo">
      <span className="w-28 font-bold text-navy">{WEEKDAYS[weekdayOf(w.date) - 1]!.short} {formatDateBR(w.date)}</span>
      {w.startMin !== null && <span className="tabular text-tinta-suave">{formatClock(w.startMin)}</span>}
      <span className="font-semibold text-tinta">{w.title}</span>
      {w.student && <span className="text-tinta-suave">· {w.student}</span>}
      <span className="flex-1" />
      {all && <span className="text-xs text-tinta-suave">{w.teacher}</span>}
      <span className="text-xs text-tinta-fraca">{w.blocks.length} bloco(s)</span>
    </Link>
  );
  return (
    <>
      <PageHeader
        title="Treinos Personal"
        description={all ? 'Os treinos que os professores montaram para as aulas de Personal.' : 'Monte o treino de cada aula de Personal sua, para o aluno. Dá para mandar no WhatsApp dele.'}
        actions={<Link href="/treinos/personal/novo" className={buttonVariants()}><Plus /> Novo treino Personal</Link>}
      />
      <Card className="mb-4 p-4 text-sm">
        <p className="font-bold text-navy">{all ? 'Aulas de Personal na grade' : 'Suas aulas de Personal na grade'}</p>
        {slots.length === 0
          ? <p className="mt-1 text-tinta-suave">Nenhuma aula de Personal na grade{all ? '' : ' em seu nome'}. Dá para montar o treino de uma aula avulsa mesmo assim.</p>
          : <p className="mt-1 text-tinta">{slots.map((s) => `${s.description}${all ? ` (${s.teachers.map((t) => t.name).join(', ')})` : ''}`).join(' · ')}</p>}
      </Card>
      <h2 className="mb-2 text-lg font-extrabold text-navy">Próximos</h2>
      <Card className="mb-4 divide-y divide-borda">{next.length ? next.map(row) : <p className="p-4 text-sm text-tinta-suave">Nenhum treino marcado daqui para frente.</p>}</Card>
      {past.length > 0 && (<><h2 className="mb-2 text-lg font-extrabold text-navy">Anteriores</h2><Card className="divide-y divide-borda">{past.map(row)}</Card></>)}
    </>
  );
}
