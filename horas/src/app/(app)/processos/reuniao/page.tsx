import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MEETING_KINDS } from '@/domain/proc-meeting';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listProcMeetings } from '@/server/services/proc-meeting-service';
import { StartMeeting } from './StartMeeting';

export const metadata: Metadata = { title: 'Reunião de líderes' };
export const dynamic = 'force-dynamic';

const br = (iso: string) => iso.split('-').reverse().join('/');

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'proc.view')) redirect('/hoje');
  const meetings = await listProcMeetings(principal);
  const open = meetings.filter((m) => m.status === 'ABERTA');
  return (
    <>
      <PageHeader title="Reunião de líderes" description="O rito da semana: placar, o que está atrasado ou travado e o foco 🎯 de cada líder. A daily é a rodada rápida de 15 minutos. Tudo acontece em cima das demandas — o que muda aqui aparece no Kanban." />

      {open.length > 0 && (
        <Card className="mb-4 border-nacao/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-nacao">Em andamento</p>
          <ul className="mt-2 space-y-1">
            {open.map((m) => <li key={m.id}><Link href={`/processos/reuniao/${m.id}`} className="font-semibold text-navy hover:text-nacao">▶ {MEETING_KINDS.find((k) => k.id === m.kind)?.label} · {br(m.date)} — continuar</Link></li>)}
          </ul>
        </Card>
      )}

      {can(principal, 'proc.admin') ? <StartMeeting /> : <Card className="mb-4 p-4 text-sm text-tinta-suave">A diretoria abre a reunião; durante ela, você atualiza as suas demandas (concluir, prazo, impedimento) por aqui ou pelo Kanban.</Card>}

      <Card className="mt-4 overflow-hidden">
        <p className="border-b border-borda px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Histórico</p>
        {meetings.length === 0 ? <p className="p-4 text-sm text-tinta-suave">Nenhuma reunião ainda. Que tal começar pela semanal de segunda?</p> : (
          <ul className="divide-y divide-borda">
            {meetings.map((m) => (
              <li key={m.id}>
                <Link href={`/processos/reuniao/${m.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-fundo">
                  <span className="w-24 font-semibold tabular-nums text-navy">{br(m.date)}</span>
                  <span className="min-w-0 flex-1">{MEETING_KINDS.find((k) => k.id === m.kind)?.label}{m.createdBy ? <span className="text-tinta-suave"> · {m.createdBy}</span> : null}</span>
                  {m.summary && <span className="text-xs text-tinta-suave tabular-nums">🎯 {m.summary.focusDone}/{m.summary.focus} · {m.summary.doneWeek} concluídas · {m.summary.late} atrasadas</span>}
                  <Badge tone={m.status === 'ABERTA' ? 'blue' : 'neutral'}>{m.status === 'ABERTA' ? 'em andamento' : 'encerrada'}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
