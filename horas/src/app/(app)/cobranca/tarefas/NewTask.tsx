'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormMessage } from '@/components/ui/alert';
import { addDays } from '@/domain/dates';
import { createManualTaskAction, searchCustomersAction } from '../actions';

/** Líder cria tarefa manual para um consultor (padrão: amanhã). Aluno opcional (alunos que estão na Cobrança). */
export function NewTask({ agents, today }: { agents: { id: string; name: string }[]; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ownerId: '', showFrom: addDays(today, 1), title: '', note: '' });
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; name: string }[]>([]);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const [pending, start] = useTransition();
  if (!open) return <Button onClick={() => setOpen(true)}><Plus /> Nova tarefa</Button>;
  return (
    <Card className="mb-4 space-y-2 p-4">
      <h2 className="font-semibold text-tinta">Nova tarefa para um consultor</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        <select value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })} className="h-10 rounded-lg border border-borda bg-white px-3 text-sm" aria-label="Consultor">
          <option value="">Consultor…</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <Input type="date" min={today} max={addDays(today, 60)} value={f.showFrom} onChange={(e) => setF({ ...f, showFrom: e.target.value })} aria-label="Dia em que aparece" />
        <Input placeholder="O que fazer (ex.: ligar para oferecer o plano anual)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>
      <Input placeholder="Observação (opcional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      <div className="text-sm">
        {customer ? (
          <p>Aluno: <strong>{customer.name}</strong> <button type="button" className="ml-2 text-xs text-nacao underline" onClick={() => setCustomer(null)}>trocar</button></p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Input className="max-w-xs" placeholder="Aluno (opcional): digite o nome" value={q} onChange={(e) => {
              const v = e.target.value; setQ(v);
              if (v.trim().length >= 2) start(async () => { const r = await searchCustomersAction(v); setFound(r.ok ? r.data : []); }); else setFound([]);
            }} />
            {found.map((c) => <button key={c.id} type="button" className="rounded-full bg-fundo px-2 py-0.5 text-xs ring-1 ring-borda hover:bg-white" onClick={() => { setCustomer(c); setFound([]); setQ(''); }}>{c.name}</button>)}
            <span className="w-full text-xs text-tinta-suave">Só aparecem alunos que estão na Cobrança (com débito ou pendência). Com aluno, a ligação registrada na Tecnofit dá baixa sozinha.</span>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button disabled={pending || !f.ownerId || f.title.trim().length < 3} onClick={() => start(async () => {
          setMsg({});
          const r = await createManualTaskAction({ ...f, note: f.note || null, customerId: customer?.id ?? null });
          if (!r.ok) return setMsg({ error: r.error });
          setMsg({ success: 'Tarefa criada: entra na lista e no WhatsApp do consultor no dia escolhido.' });
          setF({ ...f, title: '', note: '' }); setCustomer(null);
          router.refresh();
        })}>{pending ? 'Salvando…' : 'Criar tarefa'}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
      </div>
      <FormMessage error={msg.error} success={msg.success} />
    </Card>
  );
}
