import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Search } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CASE_KINDS, brl, type CaseKind } from '@/domain/cobranca';
import { cn } from '@/lib/cn';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { QUEUE_VIEWS, crmAgents, listQueue, queueCounts, type QueueView } from '@/server/services/crm-service';
import { QueueList } from './QueueList';

export const metadata: Metadata = { title: 'Fila de cobrança' };

const TABS: { id: QueueView; label: string; hint: string; all?: boolean }[] = [
  { id: 'minha', label: 'Minha fila', hint: 'Casos abertos sob a sua responsabilidade, do mais urgente (atraso × valor) para o menos.' },
  { id: 'sem', label: 'Sem responsável', hint: 'Alunos sem consultor vinculado: distribua para alguém do time.', all: true },
  { id: 'todos', label: 'Todos', hint: 'Todos os casos abertos do time.', all: true },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string; tipo?: string; q?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'crm.view')) redirect('/hoje');
  const sp = await searchParams;
  const all = can(principal, 'crm.view_all');
  const counts = await queueCounts(principal);
  const requested = (QUEUE_VIEWS as readonly string[]).includes(sp.aba ?? '') ? (sp.aba as QueueView) : null;
  const view: QueueView = requested && (requested === 'minha' || all) ? requested : all && !counts.minha ? 'todos' : 'minha';
  const kind = CASE_KINDS.some((k) => k.id === sp.tipo) ? (sp.tipo as CaseKind) : undefined;
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const [rows, agents] = await Promise.all([listQueue(principal, { view, kind, q }), all ? crmAgents(principal) : Promise.resolve([])]);
  const total = rows.reduce((s, r) => s + r.openValue, 0);
  const tab = TABS.find((t) => t.id === view)!;
  const href = (p: Record<string, string | undefined>) => {
    const u = new URLSearchParams(Object.entries({ aba: view, tipo: kind, q, ...p }).filter((e): e is [string, string] => !!e[1]));
    return `/cobranca?${u}`;
  };

  return (
    <>
      <PageHeader
        title="Fila de cobrança"
        description="Alunos da Tecnofit com venda vencida ou vencendo em até 3 dias, e pendências na recepção. Atualizado todo dia de madrugada; pagou na Tecnofit, o caso se resolve sozinho na sincronização seguinte."
        actions={can(principal, 'crm.admin') ? <Link href="/cobranca/configuracoes" className={buttonVariants({ variant: 'secondary' })}>Configurações</Link> : undefined}
      />
      <div className="mb-3 flex gap-1 overflow-x-auto border-b border-borda">
        {TABS.filter((t) => !t.all || all).map((t) => (
          <Link key={t.id} href={href({ aba: t.id })}
            className={cn('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold', t.id === view ? 'border-nacao text-nacao' : 'border-transparent text-tinta-suave hover:text-tinta')}>
            {t.label}<span className="rounded-full bg-fundo px-1.5 text-[11px] text-tinta-suave ring-1 ring-borda">{counts[t.id]}</span>
          </Link>
        ))}
      </div>
      <form className="mb-3 flex flex-wrap gap-2">
        <input type="hidden" name="aba" value={view} />
        <select name="tipo" defaultValue={kind ?? ''} className="h-10 rounded-lg border border-borda bg-white px-3 text-sm" aria-label="Tipo">
          <option value="">Cobrança e pendências</option>
          {CASE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-tinta-fraca" />
          <Input name="q" defaultValue={q} placeholder="Buscar pelo nome do aluno" className="pl-9" />
        </div>
        <button className={buttonVariants({ variant: 'secondary' })}>Filtrar</button>
      </form>
      <p className="mb-2 text-xs text-tinta-suave">{tab.hint} {rows.length > 0 && <>· <strong>{rows.length}</strong> caso(s) · <strong>{brl(total)}</strong> em aberto</>}</p>
      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-tinta-suave">
          {view === 'minha' ? 'Nenhum caso na sua fila agora.' : 'Nenhum caso aqui.'}
          {view === 'minha' && !all && <> Se você é do time de CRM e esperava casos, peça ao administrador para vincular o seu usuário ao seu consultor da Tecnofit.</>}
        </Card>
      ) : (
        <QueueList rows={rows} agents={agents} canAssign={all} />
      )}
    </>
  );
}
