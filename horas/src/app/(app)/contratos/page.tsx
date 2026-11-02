import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FilePlus2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CONTRACT_CATEGORIES, CONTRACT_STATUS, TERM_STATUS, daysUntil } from '@/domain/contracts';
import { cn } from '@/lib/cn';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { CONTRACT_VIEWS, contractCounts, listContracts, type ContractView } from '@/server/services/contract-service';

export const metadata: Metadata = { title: 'Contratos' };

const TABS: { id: ContractView; label: string; hint: string }[] = [
  { id: 'ativos', label: 'Ativos', hint: 'Assinados e dentro do prazo (inclui "a iniciar" e "vence em breve").' },
  { id: 'inativos', label: 'Inativos', hint: 'Assinados com prazo vencido ou encerrados antes do prazo.' },
  { id: 'andamento', label: 'Em andamento', hint: 'Rascunhos e contratos aguardando assinaturas.' },
  { id: 'todos', label: 'Todos', hint: '' },
  { id: 'excluidos', label: 'Lixeira', hint: 'Excluídos: não aparecem nas listas e os links não funcionam. Abra para restaurar.' },
];
const br = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string; q?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'contract.view')) redirect('/hoje');
  const sp = await searchParams;
  const counts = await contractCounts(principal);
  // Abre em "Ativos"; enquanto não houver nenhum assinado, abre em "Todos".
  const view: ContractView = (CONTRACT_VIEWS as readonly string[]).includes(sp.aba ?? '') ? (sp.aba as ContractView) : counts.ativos ? 'ativos' : 'todos';
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const rows = await listContracts(principal, { view, q });
  const today = todayIso();
  const edit = can(principal, 'contract.edit');
  const tab = TABS.find((t) => t.id === view)!;
  return (
    <>
      <PageHeader
        title="Contratos"
        description="Contratos a partir de modelos: preencha os campos, envie o link por WhatsApp e cada parte assina com um código. Assinado, o PDF fica disponível aqui e no link."
        actions={edit ? <Link href="/contratos/novo" className={buttonVariants()}><FilePlus2 /> Novo contrato</Link> : undefined}
      />
      <div className="mb-3 flex gap-1 overflow-x-auto border-b border-borda">
        {TABS.map((t) => (
          <Link key={t.id} href={`/contratos?aba=${t.id}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            className={cn('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold', t.id === view ? 'border-nacao text-nacao' : 'border-transparent text-tinta-suave hover:text-tinta')}>
            {t.label}<span className="rounded-full bg-fundo px-1.5 text-[11px] text-tinta-suave ring-1 ring-borda">{counts[t.id]}</span>
          </Link>
        ))}
      </div>
      {counts.venceEmBreve > 0 && view !== 'ativos' && (
        <p className="mb-3 text-sm text-atencao"><Link href="/contratos?aba=ativos" className="font-semibold underline">{counts.venceEmBreve} contrato(s) vencem nos próximos 30 dias</Link>.</p>
      )}
      <form className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="aba" value={view} />
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-tinta-fraca" />
          <Input name="q" defaultValue={q} placeholder="Buscar por título, código ou parte" className="pl-9" />
        </div>
        <button className={buttonVariants({ variant: 'secondary' })}>Buscar</button>
      </form>
      {tab.hint && <p className="mb-2 text-xs text-tinta-suave">{tab.hint}</p>}
      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-tinta-suave">
          Nenhum contrato {q ? 'com essa busca' : 'aqui'}.{' '}
          {edit && !q && view === 'todos' && <Link href="/contratos/novo" className="font-semibold text-nacao">Criar o primeiro</Link>}
        </Card>
      ) : (
        <Card className="divide-y divide-borda">
          {rows.map((c) => {
            const st = CONTRACT_STATUS.find((s) => s.id === c.status);
            const ts = c.termStatus ? TERM_STATUS[c.termStatus] : null;
            const signed = c.signers.filter((s) => s.status === 'ASSINADO').length;
            const left = c.endsOn ? daysUntil(c.endsOn, today) : null;
            const info = c.deletedAt ? `excluído em ${fmt(c.deletedAt)}`
              : c.status === 'AGUARDANDO' ? `${signed}/${c.signers.length} assinaram`
              : c.status === 'ASSINADO' ? (c.terminatedOn ? `encerrado em ${br(c.terminatedOn)}` : c.startsOn || c.endsOn ? `${br(c.startsOn) || '—'} a ${c.endsOn ? br(c.endsOn) : 'indeterminado'}${left !== null && left >= 0 && left <= 30 ? ` · faltam ${left} dia(s)` : ''}` : 'vigência não definida')
              : `criado em ${fmt(c.createdAt)}`;
            return (
              <Link key={c.id} href={`/contratos/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-fundo">
                <span className="w-28 shrink-0 font-mono text-xs font-semibold text-tinta-suave">{c.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-tinta">{c.title}</span>
                  <span className="block truncate text-xs text-tinta-suave">{CONTRACT_CATEGORIES.find((x) => x.id === c.category)?.label} · {c.signers.map((s) => s.name).join(', ')}</span>
                </span>
                <span className="text-xs text-tinta-suave">{info}</span>
                {ts ? <Badge tone={ts.tone}>{ts.label}</Badge> : <Badge tone={st?.tone ?? 'neutral'}>{st?.label ?? c.status}</Badge>}
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}
