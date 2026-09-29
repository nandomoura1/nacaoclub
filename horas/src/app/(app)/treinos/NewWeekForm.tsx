'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { createWeekAction } from './actions';

export function NewWeekForm({ modalities, defaultDate }: { modalities: { id: string; name: string }[]; defaultDate: string }) {
  const router = useRouter();
  const [v, setV] = useState({ modalityId: modalities[0]?.id ?? '', date: defaultDate, copyPrevious: true });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="p-4">
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await createWeekAction(v);
          if (!r.ok) return setError(r.error);
          router.push(`/treinos/${r.data}`);
        });
      }}>
        <div className="sm:w-56">
          <Label htmlFor="w-mod">Modalidade</Label>
          <Select id="w-mod" required value={v.modalityId} onChange={(e) => setV({ ...v, modalityId: e.target.value })}>
            {modalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </div>
        <div className="sm:w-44">
          <Label htmlFor="w-date">Semana de</Label>
          <Input id="w-date" type="date" required value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-tinta-suave">
          <input type="checkbox" className="accent-[#0169E9]" checked={v.copyPrevious} onChange={(e) => setV({ ...v, copyPrevious: e.target.checked })} />
          Começar copiando a semana anterior
        </label>
        <div className="flex-1" />
        <Button type="submit" disabled={pending || !v.modalityId}><Plus /> {pending ? 'Abrindo…' : 'Criar / abrir semana'}</Button>
      </form>
      <FormMessage error={error} />
    </Card>
  );
}
