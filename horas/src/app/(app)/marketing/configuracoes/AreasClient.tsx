'use client';

import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Label, Select } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import type { MktOptions } from '@/server/services/marketing-service';
import { saveAreaOwnersAction } from '../actions';
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
            <Label className="mt-3">Responsável principal</Label>
            <Select aria-label={`Responsável por ${a.name}`} disabled={pending} value={a.defaultUserId ?? ''} onChange={(e) => run(() => saveAreaOwnersAction(a.id, e.target.value || null, a.coOwnerIds.filter((u) => u !== e.target.value)))}>
              <option value="">Sem responsável padrão</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Label className="mt-3">Corresponsáveis</Label>
            <div className="flex flex-wrap gap-1.5">
              {people.filter((p) => p.id !== a.defaultUserId).map((p) => {
                const on = a.coOwnerIds.includes(p.id);
                return (
                  <button key={p.id} type="button" disabled={pending} aria-pressed={on}
                    onClick={() => run(() => saveAreaOwnersAction(a.id, a.defaultUserId, on ? a.coOwnerIds.filter((u) => u !== p.id) : [...a.coOwnerIds, p.id]))}
                    className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', on ? 'border-nacao bg-nacao text-white' : 'border-borda text-tinta-suave hover:border-nacao')}>{p.name}</button>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
