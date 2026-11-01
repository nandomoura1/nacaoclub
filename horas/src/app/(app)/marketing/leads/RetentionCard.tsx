'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { anonymizeOldLeadsAction } from '../conversao-actions';

/** LGPD: anonimizar leads parados há mais do prazo de guarda (só o admin do Marketing). */
export function RetentionCard({ pending, months }: { pending: number; months: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (!pending && !msg) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-borda bg-fundo p-3 text-sm">
      <ShieldCheck className="size-5 shrink-0 text-nacao" />
      <p className="min-w-0 flex-1 text-tinta">
        {msg ?? <><b>LGPD:</b> {pending} lead(s) não matriculados e parados há mais de {months} meses ainda guardam nome, telefone e e-mail. Anonimizar apaga esses dados pessoais e mantém origem, campanha, etapa e datas (os números do funil não mudam).</>}
      </p>
      {!msg && (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => confirm(`Anonimizar ${pending} lead(s)? Os dados pessoais serão apagados e não dá para desfazer.`) && start(async () => {
          const r = await anonymizeOldLeadsAction();
          setMsg(r.ok ? `${r.data} lead(s) anonimizados.` : r.error);
          router.refresh();
        })}>{busy ? 'Anonimizando…' : 'Anonimizar agora'}</Button>
      )}
    </div>
  );
}
