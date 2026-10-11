'use client';

import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Select } from '@/components/ui/input';
import type { MktOptions } from '@/server/services/marketing-service';
import { saveAreaOwnerAction } from '../actions';
import { useRun } from '../_components/useRun';

export function AreasClient({ areas, people }: { areas: MktOptions['areas']; people: MktOptions['people'] }) {
  const { msg, pending, run } = useRun();
  return (
    <div className="space-y-3">
      <FormMessage error={msg.error} success={msg.ok} />
      {people.length === 0 && <p className="rounded-lg bg-atencao/10 p-3 text-sm text-atencao">Ninguém tem acesso ao Marketing ainda. Dê o perfil <b>Marketing</b> às pessoas em Administração → Usuários.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {areas.map((a) => (
          <Card key={a.id} className="p-4">
            <p className="flex items-center gap-2 font-bold text-navy"><span className="size-3 rounded-full" style={{ background: a.color }} />{a.name}</p>
            <p className="mt-0.5 text-xs text-tinta-suave">{a.question}</p>
            <Select className="mt-3" aria-label={`Responsável por ${a.name}`} disabled={pending} value={a.defaultUserId ?? ''} onChange={(e) => run(() => saveAreaOwnerAction(a.id, e.target.value || null))}>
              <option value="">Sem responsável padrão</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Card>
        ))}
      </div>
    </div>
  );
}
