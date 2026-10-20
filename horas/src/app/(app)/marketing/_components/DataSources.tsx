import Link from 'next/link';
import { Cable } from 'lucide-react';
import { CONN_STATUS } from '@/domain/marketing/connections';
import { cn } from '@/lib/cn';
import type { Principal } from '@/server/auth/principal';
import { connections } from '@/server/services/mkt-connections-service';

const DOT = { auto: 'bg-sucesso', waiting: 'bg-atencao', manual: 'bg-nacao', off: 'bg-tinta-fraca/50' } as const;

/** Faixa "de onde vêm estes números": status das conexões que alimentam a tela. */
export async function DataSources({ principal, keys }: { principal: Principal; keys: string[] }) {
  const list = (await connections(principal)).filter((c) => keys.includes(c.key));
  const manual = list.some((c) => c.status === 'manual' || c.status === 'off');
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-borda bg-white px-3 py-2 text-xs">
      <span className="font-semibold text-tinta-suave">Fontes:</span>
      {list.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1.5" title={c.headline}>
          <span className={cn('size-2 rounded-full', DOT[c.status])} />
          <span className="text-tinta">{c.name.replace(/ \(.*\)$/, '')}</span>
          <span className="text-tinta-fraca">· {CONN_STATUS[c.status].label.toLowerCase()}</span>
        </span>
      ))}
      <Link href="/marketing/conexoes" className="ml-auto inline-flex items-center gap-1 font-semibold text-nacao hover:underline">
        <Cable className="size-3.5" /> {manual ? 'Automatizar em Conexões' : 'Ver conexões'}
      </Link>
    </div>
  );
}
