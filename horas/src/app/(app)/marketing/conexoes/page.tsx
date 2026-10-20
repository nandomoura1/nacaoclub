import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, CheckCircle2, CircleDashed, Clock, Hand } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, PageHeader } from '@/components/ui/card';
import { CONN_STATUS, PLATFORMS, summary, type ConnStatus } from '@/domain/marketing/connections';
import { cn } from '@/lib/cn';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { connections } from '@/server/services/mkt-connections-service';

export const metadata: Metadata = { title: 'Conexões do Marketing' };
export const dynamic = 'force-dynamic';

const ICON: Record<ConnStatus, typeof CheckCircle2> = { auto: CheckCircle2, waiting: Clock, manual: Hand, off: CircleDashed };
const COLOR: Record<ConnStatus, string> = { auto: 'text-sucesso', waiting: 'text-atencao', manual: 'text-nacao', off: 'text-tinta-fraca' };

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const list = await connections(principal);
  const s = summary(list);
  const admin = can(principal, 'mkt.admin');
  return (
    <>
      <PageHeader title="Conexões" description="Tudo que alimenta o Marketing: o que chega sozinho, o que ainda é lançado à mão e o próximo passo de cada integração." />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(['auto', 'waiting', 'manual', 'off'] as ConnStatus[]).map((k) => {
          const I = ICON[k];
          return (
            <Card key={k} className="p-3">
              <p className={cn('flex items-center gap-1.5 text-xs font-semibold', COLOR[k])}><I className="size-4" /> {CONN_STATUS[k].label}</p>
              <p className="mt-1 text-2xl font-extrabold text-navy">{s[k]}<span className="text-sm font-semibold text-tinta-fraca"> / {s.total}</span></p>
            </Card>
          );
        })}
      </div>

      <div className="space-y-6">
        {PLATFORMS.map((p) => {
          const items = list.filter((c) => c.platform === p);
          if (!items.length) return null;
          return (
            <section key={p}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-navy">{p}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((c) => {
                  const I = ICON[c.status];
                  return (
                    <Card key={c.key} className={cn('flex flex-col p-4', c.status === 'auto' && 'border-sucesso/30')}>
                      <div className="flex items-start gap-2">
                        <I className={cn('mt-0.5 size-5 shrink-0', COLOR[c.status])} />
                        <h3 className="min-w-0 flex-1 font-bold text-navy">{c.name}</h3>
                        <Badge tone={CONN_STATUS[c.status].tone}>{CONN_STATUS[c.status].label}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-tinta">{c.headline}</p>
                      {(c.metrics.length > 0 || c.lastAt) && (
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-tinta-suave">
                          {c.metrics.map((m) => <span key={m.label}>{m.label}: <b className="text-navy">{m.value}</b></span>)}
                          {c.lastAt && <span>Último dado: <b className="text-navy">{c.lastAt}</b></span>}
                        </div>
                      )}
                      {c.next && <p className="mt-2 rounded-lg bg-fundo px-2 py-1.5 text-xs text-tinta"><b>Próximo passo:</b> {c.next}</p>}
                      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs">
                        <span className="text-tinta-fraca">Alimenta:</span>
                        {c.feeds.map((f) => <Link key={f.href + f.label} href={f.href} className="font-semibold text-nacao hover:underline">{f.label}</Link>)}
                        {admin && c.guide && c.status !== 'auto' && (
                          <Link href={`/marketing/integracoes#${c.guide}`} className="ml-auto inline-flex items-center gap-1 font-semibold text-nacao hover:underline">Como conectar <ArrowRight className="size-3" /></Link>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {admin && <p className="mt-6 text-xs text-tinta-suave">Passo a passo de cada conexão, endereços de webhook e variáveis: <Link href="/marketing/integracoes" className="font-semibold text-nacao">Guia de conexão →</Link></p>}
    </>
  );
}
