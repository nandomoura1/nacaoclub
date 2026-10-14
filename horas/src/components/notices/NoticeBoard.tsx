'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Megaphone, Pin } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { kindOf } from '@/domain/marketing/notices';
import { cn } from '@/lib/cn';
import type { BoardItem } from '@/server/services/mkt-notice-service';
import { markNoticeReadAction } from '@/app/(app)/marketing/interna-actions';

/** Mural de comunicados (tela Hoje / Meu extrato). Não lidos primeiro, com "Li". */
export function NoticeBoard({ items }: { items: BoardItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(items.find((i) => !i.read)?.id ?? null);
  if (!items.length) return null;
  const unread = items.filter((i) => !i.read).length;
  return (
    <Card className={cn('mb-4 p-3', unread && 'border-nacao/40')}>
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">
        <Megaphone className="size-4 text-nacao" /> Comunicados {unread > 0 && <span className="rounded-full bg-nacao px-1.5 py-0.5 text-[10px] text-white">{unread} novo{unread > 1 ? 's' : ''}</span>}
      </p>
      <ul className="mt-2 divide-y divide-borda">
        {items.map((n) => (
          <li key={n.id} className="py-2">
            <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => setOpen(open === n.id ? null : n.id)} aria-expanded={open === n.id}>
              <span aria-hidden>{kindOf(n.kind).emoji}</span>
              <span className={cn('min-w-0 flex-1 text-sm', n.read ? 'text-tinta-suave' : 'font-semibold text-navy')}>{n.title}</span>
              {n.pinned && <Pin className="size-3.5 shrink-0 text-nacao" aria-label="fixado" />}
              <span className="shrink-0 text-[11px] text-tinta-suave">{new Date(n.publishedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })}</span>
            </button>
            {open === n.id && (
              <div className="mt-2 pl-6">
                <p className="whitespace-pre-line text-sm text-tinta">{n.body.replace(/\*([^*\n]+)\*/g, '$1').replace(/_([^_\n]+)_/g, '$1')}</p>
                {!n.read ? (
                  <button type="button" disabled={pending} onClick={() => start(async () => { await markNoticeReadAction(n.id); setOpen(null); router.refresh(); })}
                    className="mt-2 inline-flex items-center gap-1 rounded-md bg-nacao px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">
                    <Check className="size-3.5" /> Li
                  </button>
                ) : <p className="mt-1 text-[11px] text-sucesso">✓ lido</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
