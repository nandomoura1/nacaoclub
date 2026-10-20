import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { commandCenter, mktOptions } from '@/server/services/marketing-service';
import Link from 'next/link';
import { Cable } from 'lucide-react';
import { summary } from '@/domain/marketing/connections';
import { connections } from '@/server/services/mkt-connections-service';
import { CommandCenter } from './CommandCenter';

export const metadata: Metadata = { title: 'Marketing' };
// "Atualizar recomendações" chama a IA.
export const maxDuration = 300;

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const today = todayIso();
  const [v, options, conns] = await Promise.all([commandCenter(principal, today), mktOptions(), connections(principal)]);
  const s = summary(conns);
  return (
    <>
      <Link href="/marketing/conexoes" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-borda bg-white px-3 py-2 text-xs hover:border-nacao">
        <span className="inline-flex items-center gap-1.5 font-semibold text-navy"><Cable className="size-4 text-nacao" /> Conexões</span>
        <span><b className="text-sucesso">{s.auto}</b> automáticas</span>
        {s.waiting > 0 && <span><b className="text-atencao">{s.waiting}</b> aguardando dados</span>}
        {s.manual > 0 && <span><b className="text-nacao">{s.manual}</b> manuais</span>}
        {s.off > 0 && <span><b className="text-tinta-suave">{s.off}</b> não conectadas</span>}
        <span className="ml-auto font-semibold text-nacao">Ver painel →</span>
      </Link>
      <CommandCenter v={v} options={options} today={today} perms={{ edit: can(principal, 'mkt.edit'), ai: can(principal, 'mkt.ai') }} />
    </>
  );
}
