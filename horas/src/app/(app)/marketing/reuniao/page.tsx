import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui/card';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listMeetings } from '@/server/services/mkt-ai-service';
import { NewMeetingButton } from './NewMeetingButton';

export const metadata: Metadata = { title: 'Reunião semanal' };

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const rows = await listMeetings(principal);
  return (
    <>
      <PageHeader title="Reunião semanal de Marketing" description="Pauta automática a partir do calendário, das campanhas e das pendências. A IA redige a ata; decisões viram tarefas."
        actions={can(principal, 'mkt.edit') ? <NewMeetingButton today={todayIso()} /> : undefined} />
      {rows.length === 0 && <Card className="p-6 text-center text-sm text-tinta-suave">Nenhuma reunião ainda. Abra a primeira — a pauta é montada sozinha.</Card>}
      <Card className="divide-y divide-borda">
        {rows.map((m) => (
          <Link key={m.id} href={`/marketing/reuniao/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-fundo/60">
            <span className="font-titulo font-extrabold text-navy">{m.date.split('-').reverse().join('/')}</span>
            <span className="min-w-0 flex-1 text-sm text-tinta-suave">{m.sections} ponto(s) de pauta</span>
            {m.hasMinutes && <span className="flex items-center gap-1 text-xs font-semibold text-sucesso"><CheckCircle2 className="size-3.5" /> ata</span>}
            <ChevronRight className="size-4 text-tinta-fraca" />
          </Link>
        ))}
      </Card>
    </>
  );
}
