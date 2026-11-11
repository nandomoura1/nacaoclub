import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { TASK_VIEWS, listTasks, taskCounts, teamSummary, type TaskView } from '@/server/services/crm-task-service';
import { TaskList } from './TaskList';
import { NewTask } from './NewTask';
import { todayIso } from '@/lib/today';
import { crmAgents } from '@/server/services/crm-service';

export const metadata: Metadata = { title: 'Tarefas de CRM' };

const TABS: { id: TaskView; label: string; all?: boolean; hint?: string }[] = [
  { id: 'minhas', label: 'Minhas tarefas' },
  { id: 'sem', label: 'Sem responsável', all: true, hint: 'Alunos sem consultor vinculado: distribua na Fila de cobrança.' },
  { id: 'escalados', label: 'Escalados (D+15)', all: true },
  { id: 'agendadas', label: 'Agendadas', all: true, hint: 'Adiadas e tarefas do líder com data futura: entram na lista e no WhatsApp no dia marcado.' },
  { id: 'retidas', label: 'Fora das regras', all: true, hint: 'Tipos que o consultor não recebe (Time de CRM): ficam só aqui, com você.' },
  { id: 'todas', label: 'Todas de hoje', all: true },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'crm.view')) redirect('/hoje');
  const all = can(principal, 'crm.view_all');
  const counts = await taskCounts(principal);
  const sp = await searchParams;
  const req = (TASK_VIEWS as readonly string[]).includes(sp.aba ?? '') ? (sp.aba as TaskView) : null;
  const view: TaskView = req && (req === 'minhas' || all) ? req : all && !counts.minhas ? 'todas' : 'minhas';
  const [rows, team, agents] = await Promise.all([listTasks(principal, view), all ? teamSummary(principal) : Promise.resolve([]), all ? crmAgents(principal) : Promise.resolve([])]);
  const today = todayIso();
  const tab = TABS.find((t) => t.id === view)!;

  return (
    <>
      <PageHeader
        title="Tarefas de CRM"
        description="Quem contatar hoje, e por quê. O sistema não fala com o aluno: você faz o contato e registra a ligação na Tecnofit (Ligações do CRM) — a tarefa sai da lista sozinha na sincronização da madrugada. Combinou retorno ou promessa? Agende a ligação na Tecnofit com a data: a régua pausa até lá."
        actions={all ? <a href="/cobranca/time" className="text-sm font-semibold text-nacao underline">Time de CRM: regras e horários</a> : undefined}
      />
      {all && <div className="mb-4"><NewTask agents={agents} today={today} /></div>}
      {all && team.length > 0 && (
        <Card className="mb-4 overflow-x-auto p-3">
          <table className="w-full text-left text-xs">
            <thead className="text-tinta-suave"><tr><th className="py-1 pr-3">Consultor</th><th className="pr-3">Abertas</th><th className="pr-3">Atrasadas</th><th className="pr-3">Feitas (7 dias)</th><th>…com ligação na Tecnofit</th></tr></thead>
            <tbody className="divide-y divide-borda">
              {team.map((t) => (
                <tr key={t.name}><td className="py-1.5 pr-3 font-semibold text-tinta">{t.name}</td><td className="pr-3">{t.open}</td><td className={cn('pr-3', t.late && 'font-semibold text-critico')}>{t.late}</td><td className="pr-3">{t.done7}</td><td>{t.byCall7}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <div className="mb-3 flex gap-1 overflow-x-auto border-b border-borda">
        {TABS.filter((t) => !t.all || all).map((t) => (
          <Link key={t.id} href={`/cobranca/tarefas?aba=${t.id}`}
            className={cn('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold', t.id === view ? 'border-nacao text-nacao' : 'border-transparent text-tinta-suave hover:text-tinta')}>
            {t.label}<span className="rounded-full bg-fundo px-1.5 text-[11px] text-tinta-suave ring-1 ring-borda">{counts[t.id]}</span>
          </Link>
        ))}
      </div>
      {tab.hint && <p className="mb-2 text-xs text-tinta-suave">{tab.hint}</p>}
      {rows.length === 0
        ? <Card className="p-8 text-center text-sm text-tinta-suave">{view === 'minhas' ? 'Nenhuma tarefa para você agora. 🎉' : 'Nenhuma tarefa aqui.'}</Card>
        : <TaskList rows={rows} showOwner={view !== 'minhas'} canManage={all} today={today} />}
    </>
  );
}
