'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/alert';
import { Select } from '@/components/ui/input';
import { saveClassLinkAction } from '../../tv-actions';

interface Row { tecnofitClassId: string; name: string; modality: string | null; place: string | null; modalityId: string | null; spaceId: string | null; suggestion: string | null }
type Opt = { id: string; name: string };

function Line({ r, modalities, spaces }: { r: Row; modalities: Opt[]; spaces: Opt[] }) {
  const router = useRouter();
  const [m, setM] = useState(r.modalityId ?? r.suggestion ?? '');
  const [sp, setSp] = useState(r.spaceId ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = (m || null) !== r.modalityId || (sp || null) !== r.spaceId;
  return (
    <div className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
      <div className="min-w-48 flex-1">
        <span className="font-semibold text-tinta">{r.name}</span>
        <span className="ml-2 text-xs text-tinta-suave">{[r.modality, r.place].filter(Boolean).join(' · ')}</span>
        {!r.modalityId && r.suggestion && <Badge tone="cyan" className="ml-2">sugestão</Badge>}
        {r.modalityId && <Badge tone="green" className="ml-2">vinculada</Badge>}
      </div>
      <Select className="h-9 w-auto" value={m} onChange={(e) => setM(e.target.value)} aria-label={`Modalidade da turma ${r.name}`}>
        <option value="">— não vincular —</option>
        {modalities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </Select>
      <Select className="h-9 w-auto" value={sp} onChange={(e) => setSp(e.target.value)} aria-label={`Espaço da turma ${r.name}`}>
        <option value="">Qualquer espaço</option>
        {spaces.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </Select>
      <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={pending || !dirty} onClick={() => start(async () => {
        setMsg(null);
        const res = await saveClassLinkAction({ tecnofitClassId: r.tecnofitClassId, name: r.name, modalityId: m || null, spaceId: sp || null });
        if (!res.ok) return setMsg(res.error);
        router.refresh();
      })}>{pending ? 'Salvando…' : 'Salvar'}</Button>
      {msg && <div className="w-full"><FormMessage error={msg} /></div>}
    </div>
  );
}

export function ClassLinks({ rows, modalities, spaces }: { rows: Row[]; modalities: Opt[]; spaces: Opt[] }) {
  if (!rows.length) return <p className="text-sm text-tinta-suave">Nenhuma turma ativa encontrada na Tecnofit.</p>;
  return <div className="divide-y divide-borda rounded-lg border border-borda">{rows.map((r) => <Line key={r.tecnofitClassId} r={r} modalities={modalities} spaces={spaces} />)}</div>;
}
