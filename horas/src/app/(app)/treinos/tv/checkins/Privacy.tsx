'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { setHiddenAction } from '../../tv-actions';

interface Data {
  day: string;
  groups: { title: string; people: { customerTecId: string; name: string; label: string; hidden: boolean }[] }[];
  hidden: { customerTecId: string; name: string; since: string }[];
}

/** Recepção: check-ins de hoje (nome completo só aqui, com login) e quem pediu para não aparecer. */
export function Privacy({ data }: { data: Data }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const toggle = (id: string, hidden: boolean) => { setBusy(id); start(async () => { setMsg({}); const r = await setHiddenAction(id, hidden); setBusy(null); if (!r.ok) return setMsg({ error: r.error }); setMsg({ success: r.message }); router.refresh(); }); };
  return (
    <Card className="p-4">
      <h2 className="font-bold text-navy">Quem não quer aparecer na TV</h2>
      <p className="mb-3 text-xs text-tinta-suave">O aluno pediu para não aparecer? Ache-o nos check-ins de hoje e clique em “Não mostrar”. Vale para todas as TVs e para os próximos dias (ele continua contando no número de check-ins).</p>
      <FormMessage error={msg.error} success={msg.success} />
      {data.hidden.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold text-tinta-suave">Não aparecem ({data.hidden.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {data.hidden.map((h) => (
              <span key={h.customerTecId} className="flex items-center gap-1 rounded-full bg-fundo px-2 py-0.5 text-xs ring-1 ring-borda">
                {h.name}
                <button type="button" className="text-nacao underline disabled:opacity-50" disabled={busy === h.customerTecId} onClick={() => toggle(h.customerTecId, false)}>voltar a mostrar</button>
              </span>
            ))}
          </div>
        </div>
      )}
      {data.groups.length === 0 ? (
        <p className="text-sm text-tinta-suave">Nenhum check-in hoje ainda (ou a Tecnofit não respondeu).</p>
      ) : (
        <div className="space-y-2">
          {data.groups.map((g) => (
            <details key={g.title} className="rounded-lg border border-borda p-2">
              <summary className="cursor-pointer text-sm font-semibold text-tinta">{g.title} · {g.people.length} check-in(s)</summary>
              <div className="mt-2 divide-y divide-borda">
                {g.people.map((p) => (
                  <div key={p.customerTecId} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className="flex-1">{p.name} <span className="text-xs text-tinta-suave">· na TV: {p.hidden ? 'não aparece' : p.label}</span></span>
                    <Button size="sm" variant="ghost" disabled={busy === p.customerTecId} onClick={() => toggle(p.customerTecId, !p.hidden)}>
                      {p.hidden ? <><Eye /> Voltar a mostrar</> : <><EyeOff /> Não mostrar</>}
                    </Button>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </Card>
  );
}
