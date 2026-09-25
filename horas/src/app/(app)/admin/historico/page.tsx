import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listAuditLogs } from '@/server/services/audit-service';

export const metadata: Metadata = { title: 'Histórico de alterações' };

const ACTION_TONE: Record<string, 'green' | 'red' | 'blue' | 'amber' | 'neutral'> = {
  'auth.login': 'green',
  'auth.login_failed': 'red',
  'user.created': 'blue',
  'user.updated': 'amber',
  'user.password_reset': 'amber',
  'auth.password_changed': 'neutral',
};

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'login',
  'auth.login_failed': 'login recusado',
  'auth.password_changed': 'senha',
  'user.created': 'usuário criado',
  'user.updated': 'usuário alterado',
  'user.password_reset': 'senha provisória',
};

type Search = { q?: string; page?: string };

export default async function HistoricoPage({ searchParams }: { searchParams: Promise<Search> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'audit.view')) redirect('/hoje');

  const sp = await searchParams;
  const { items, total, page, pages } = await listAuditLogs(principal, { q: sp.q || undefined, page: sp.page });

  const href = (p: number) => `/admin/historico?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader
        title="Histórico de alterações"
        description="Tudo que muda no sistema fica registrado aqui — e nada daqui pode ser apagado."
      />

      <form className="mb-4 flex gap-2 sm:w-96">
        <Input name="q" defaultValue={sp.q} placeholder="Buscar: nome, ação, e-mail…" />
        <button className={buttonVariants({ variant: 'secondary' })}>Buscar</button>
      </form>

      <Card>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-tinta-suave">
            <History className="size-6 text-tinta-fraca" />
            Nenhum registro encontrado.
          </div>
        ) : (
          <ol className="divide-y divide-borda">
            {items.map((log) => (
              <li key={log.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-start sm:gap-4">
                <time className="tabular w-40 shrink-0 text-xs font-semibold text-tinta-fraca">{formatDateTime(log.at)}</time>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-tinta">{log.summary}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-tinta-fraca">
                    <Badge tone={ACTION_TONE[log.action] ?? 'neutral'}>{ACTION_LABEL[log.action] ?? log.action}</Badge>
                    {log.actor?.name && <span>por {log.actor.name}</span>}
                    {log.ipAddress && <span>· IP {log.ipAddress}</span>}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <div className="mt-4 flex items-center justify-between text-sm text-tinta-suave">
        <span className="tabular">{total} registro(s)</span>
        <div className="flex items-center gap-2">
          <Link aria-disabled={page <= 1} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), page <= 1 && 'pointer-events-none opacity-40')} href={href(page - 1)}>
            <ChevronLeft /> Anterior
          </Link>
          <span className="tabular">{page} / {pages}</span>
          <Link aria-disabled={page >= pages} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), page >= pages && 'pointer-events-none opacity-40')} href={href(page + 1)}>
            Próxima <ChevronRight />
          </Link>
        </div>
      </div>
    </>
  );
}
