'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import { FormMessage } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { createSimulationAction } from './actions';

export function NewSimulation({ areas, today, allAreas }: { areas: { id: string; name: string }[]; today: string; allAreas: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState(allAreas ? '' : areas[0]?.id ?? '');
  const [baseDate, setBaseDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const create = () => start(async () => {
    const r = await createSimulationAction({ name, areaId: areaId || null, baseDate });
    if (!r.ok) { setError(r.error); return; }
    router.push(`/grade/simulacao/${r.data}`);
  });
  return (
    <Card className="h-fit space-y-3 p-4">
      <h2 className="text-sm font-extrabold text-navy">Nova simulação</h2>
      <p className="text-xs text-tinta-suave">Começa com uma cópia da grade de uma data. Depois é só editar.</p>
      <div><Label htmlFor="sim-name">Nome</Label><Input id="sim-name" value={name} maxLength={80} placeholder="Ex.: Grade de verão 2027" onChange={(e) => setName(e.target.value)} /></div>
      <div>
        <Label htmlFor="sim-area">Área</Label>
        <Select id="sim-area" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
          {allAreas && <option value="">Todas as áreas</option>}
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </div>
      <div><Label htmlFor="sim-base">Copiar a grade de</Label><Input id="sim-base" type="date" value={baseDate} onChange={(e) => setBaseDate(e.target.value)} /></div>
      <FormMessage error={error} />
      <Button className="w-full" disabled={pending || name.trim().length < 3} onClick={create}><Copy /> Copiar grade e simular</Button>
    </Card>
  );
}
