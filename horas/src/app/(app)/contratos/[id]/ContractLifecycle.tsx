'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange, RotateCcw, Trash2 } from 'lucide-react';
import { FormMessage } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { TERM_STATUS, daysUntil } from '@/domain/contracts';
import type { ContractDetail } from '@/server/services/contract-service';
import { deleteContractAction, restoreContractAction, setContractTermAction, terminateContractAction } from '../actions';

const br = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

/** Vigência (ativo/inativo pelo prazo), encerramento antecipado e lixeira. */
export function ContractLifecycle({ contract: c, canEdit, today }: { contract: ContractDetail; canEdit: boolean; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const [mode, setMode] = useState<null | 'term' | 'end' | 'delete'>(null);
  const [startsOn, setStartsOn] = useState(c.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(c.endsOn ?? '');
  const [indefinite, setIndefinite] = useState(!!c.startsOn && !c.endsOn);
  const [endOn, setEndOn] = useState(today);
  const [reason, setReason] = useState('');
  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) => start(async () => {
    const r = await fn();
    if (!r.ok) { setMsg({ error: r.error }); return; }
    setMsg({ success: r.message }); setMode(null); setReason(''); router.refresh();
  });

  if (c.deletedAt) {
    return (
      <Card className="flex flex-wrap items-center gap-3 border-critico/40 bg-critico/5 p-4">
        <Trash2 className="size-5 text-critico" />
        <span className="flex-1 text-sm text-critico"><b>Na lixeira</b> desde {new Date(c.deletedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}{c.deleteReason ? ` — ${c.deleteReason}` : ''}. Não aparece nas listas e os links de assinatura não funcionam.</span>
        {canEdit && <Button variant="secondary" disabled={pending} onClick={() => run(() => restoreContractAction(c.id))}><RotateCcw /> Restaurar</Button>}
        <div className="w-full"><FormMessage error={msg.error} success={msg.success} /></div>
      </Card>
    );
  }

  const ts = c.termStatus ? TERM_STATUS[c.termStatus] : null;
  const left = c.endsOn ? daysUntil(c.endsOn, today) : null;
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <CalendarRange className="size-5 text-nacao" />
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-extrabold text-navy">Vigência: </span>
          {c.startsOn || c.endsOn ? <>{br(c.startsOn)} a {c.endsOn ? br(c.endsOn) : 'prazo indeterminado'}</> : <span className="text-tinta-suave">não definida</span>}
          {left !== null && left >= 0 && c.termStatus !== 'ENCERRADO' && <span className="text-tinta-suave"> · {left === 0 ? 'vence hoje' : `faltam ${left} dia(s)`}</span>}
          {c.terminatedOn && <span className="text-critico"> · encerrado em {br(c.terminatedOn)}{c.terminationReason ? ` (${c.terminationReason})` : ''}</span>}
        </div>
        {ts && <Badge tone={ts.tone}>{ts.label}</Badge>}
        {canEdit && (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="secondary" onClick={() => setMode(mode === 'term' ? null : 'term')}>Ajustar vigência</Button>
            {c.status === 'ASSINADO' && (c.terminatedOn
              ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm('Desfazer o encerramento? O contrato volta a valer pelo prazo.')) run(() => terminateContractAction(c.id, null)); }}>Desfazer encerramento</Button>
              : <Button size="sm" variant="ghost" onClick={() => setMode(mode === 'end' ? null : 'end')}>Encerrar antes do prazo</Button>)}
            {c.status !== 'AGUARDANDO' && <Button size="sm" variant="ghost" className="text-critico" onClick={() => setMode(mode === 'delete' ? null : 'delete')}><Trash2 /> Excluir</Button>}
          </div>
        )}
      </div>

      {mode === 'term' && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-fundo p-3">
          <div><Label>Início</Label><Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></div>
          <div><Label>Término</Label><Input type="date" value={indefinite ? '' : endsOn} disabled={indefinite} onChange={(e) => setEndsOn(e.target.value)} /></div>
          <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" className="accent-nacao" checked={indefinite} onChange={(e) => setIndefinite(e.target.checked)} /> Prazo indeterminado</label>
          <Button disabled={pending} onClick={() => run(() => setContractTermAction(c.id, { startsOn: startsOn || null, endsOn: indefinite ? null : endsOn || null }))}>Salvar vigência</Button>
          <p className="w-full text-xs text-tinta-suave">Controle interno para saber se o contrato está ativo. O texto assinado não muda: prorrogação de verdade pede aditivo assinado.</p>
        </div>
      )}
      {mode === 'end' && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-fundo p-3">
          <div><Label>Encerrado em</Label><Input type="date" value={endOn} onChange={(e) => setEndOn(e.target.value)} /></div>
          <div className="min-w-60 flex-1"><Label>Motivo</Label><Input value={reason} maxLength={300} placeholder="Ex.: distrato assinado em 10/11" onChange={(e) => setReason(e.target.value)} /></div>
          <Button variant="danger" disabled={pending || reason.trim().length < 3 || !endOn} onClick={() => run(() => terminateContractAction(c.id, { on: endOn, reason }))}>Encerrar</Button>
        </div>
      )}
      {mode === 'delete' && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-critico/5 p-3">
          <div className="min-w-60 flex-1"><Label>Motivo da exclusão</Label><Input value={reason} maxLength={300} placeholder="Ex.: criado por engano / duplicado" onChange={(e) => setReason(e.target.value)} /></div>
          <Button variant="danger" disabled={pending || reason.trim().length < 3} onClick={() => { if (confirm(`Mover ${c.code} para a lixeira? Os links de assinatura param de funcionar. Dá para restaurar depois.`)) run(() => deleteContractAction(c.id, reason)); }}>Mover para a lixeira</Button>
        </div>
      )}
      <FormMessage error={msg.error} success={msg.success} />
    </Card>
  );
}
