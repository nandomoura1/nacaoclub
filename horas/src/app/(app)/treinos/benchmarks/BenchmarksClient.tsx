'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, EyeOff, Pencil, Plus, Search, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label } from '@/components/ui/input';
import { BENCHMARK_CATEGORIES, benchmarkText, matchBenchmark, type BenchmarkCategory } from '@/domain/benchmarks';
import { cn } from '@/lib/cn';
import type { BenchmarkView } from '@/server/services/benchmark-service';
import { saveBenchmarkAction, setBenchmarkActiveAction } from './actions';

const LABEL = Object.fromEntries(BENCHMARK_CATEGORIES.map((c) => [c.value, c.label])) as Record<BenchmarkCategory, string>;
const TONE: Record<BenchmarkCategory, 'blue' | 'navy' | 'cyan' | 'amber'> = { GIRL: 'blue', HERO: 'navy', CLASSICO: 'cyan', NACAO: 'amber' };
type Form = { id: string | null; name: string; format: string; timeCapMin: string; content: string; notes: string };
const EMPTY: Form = { id: null, name: '', format: '', timeCapMin: '', content: '', notes: '' };

export function BenchmarksClient({ items }: { items: BenchmarkView[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<BenchmarkCategory | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();

  const visible = useMemo(
    () => items.filter((b) => (showHidden || b.active) && (!cat || b.category === cat) && matchBenchmark(b, q)),
    [items, q, cat, showHidden],
  );
  const count = (c: BenchmarkCategory) => items.filter((b) => b.active && b.category === c).length;

  const save = () => form && start(async () => {
    const r = await saveBenchmarkAction(form.id, { name: form.name, format: form.format, timeCapMin: form.timeCapMin, content: form.content, notes: form.notes });
    if (!r.ok) return setMsg({ error: r.error });
    setForm(null);
    setMsg({ ok: `Benchmark ${form.name} salvo.` });
    router.refresh();
  });

  return (
    <>
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-fraca" />
          <Input className="pl-9" placeholder="Buscar: Fran, thruster, AMRAP…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar benchmark" />
        </div>
        <Button onClick={() => { setMsg({}); setForm(EMPTY); }}><Plus /> Novo benchmark da Nação</Button>
        <div className="-mx-3 flex w-[calc(100%+1.5rem)] gap-2 overflow-x-auto px-3 pb-1">
          <button onClick={() => setCat(null)} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold', !cat ? 'border-navy bg-navy text-white' : 'border-borda text-tinta')}>
            Todos
          </button>
          {BENCHMARK_CATEGORIES.map((c) => (
            <button key={c.value} onClick={() => setCat(cat === c.value ? null : c.value)}
              className={cn('shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold', cat === c.value ? 'border-navy bg-navy text-white' : 'border-borda text-tinta')}>
              {c.label} <span className="opacity-60">{count(c.value)}</span>
            </button>
          ))}
          <button onClick={() => setShowHidden(!showHidden)} className="ml-auto shrink-0 whitespace-nowrap px-2 text-xs font-semibold text-tinta-suave hover:text-nacao">
            {showHidden ? 'Esconder ocultos' : 'Mostrar ocultos'}
          </button>
        </div>
      </Card>
      <FormMessage error={msg.error} success={msg.ok} />

      {visible.length === 0 && <Card className="p-6 text-sm text-tinta-suave">Nenhum benchmark encontrado{q ? ` para "${q}"` : ''}.</Card>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((b) => (
          <Card key={b.id} className={cn('flex min-w-0 flex-col p-4', !b.active && 'opacity-55')}>
            <div className="mb-1 flex items-start gap-2">
              <Trophy className="mt-1 size-4 shrink-0 text-nacao" />
              <h3 className="min-w-0 flex-1 text-lg font-extrabold leading-tight text-navy">{b.name}</h3>
              <Badge tone={TONE[b.category]}>{LABEL[b.category]}</Badge>
            </div>
            {(b.format || b.timeCapMin) && (
              <p className="mb-2 text-sm font-bold text-nacao">{[b.format, b.timeCapMin ? `Time cap ${b.timeCapMin}'` : null].filter(Boolean).join(' · ')}</p>
            )}
            <ul className="mb-2 space-y-0.5 text-sm text-tinta">
              {b.content.split('\n').filter((l) => l.trim()).map((l, i) => <li key={i} className="flex gap-2"><span className="text-tinta-fraca">•</span><span>{l}</span></li>)}
            </ul>
            {b.notes && <p className="mb-2 text-xs text-tinta-suave">{b.notes}</p>}
            <div className="mt-auto flex flex-wrap gap-1 pt-2">
              <Button variant="ghost" size="sm" onClick={async () => { await navigator.clipboard.writeText(benchmarkText(b)); setMsg({ ok: `Texto do ${b.name} copiado. É só colar no grupo.` }); }}>
                <Copy /> Copiar texto
              </Button>
              {b.source === 'NACAO' && (
                <Button variant="ghost" size="sm" onClick={() => { setMsg({}); setForm({ id: b.id, name: b.name, format: b.format ?? '', timeCapMin: b.timeCapMin ? String(b.timeCapMin) : '', content: b.content, notes: b.notes ?? '' }); }}>
                  <Pencil /> Editar
                </Button>
              )}
              <Button variant="ghost" size="sm" disabled={pending} className="ml-auto text-tinta-suave"
                onClick={() => start(async () => { const r = await setBenchmarkActiveAction(b.id, !b.active); if (!r.ok) setMsg({ error: r.error }); else router.refresh(); })}>
                {b.active ? <><EyeOff /> Ocultar</> : <><Eye /> Reativar</>}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4" onClick={() => setForm(null)}>
          <Card className="max-h-[90dvh] w-full max-w-lg overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-extrabold text-navy">{form.id ? 'Editar benchmark' : 'Novo benchmark da Nação'}</h3>
            <div className="grid gap-3">
              <div><Label htmlFor="bm-n">Nome</Label><Input id="bm-n" maxLength={60} placeholder="Ex.: Nação 300" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <div><Label htmlFor="bm-f">Formato</Label><Input id="bm-f" maxLength={120} placeholder="For time · AMRAP 20' · 21-15-9" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} /></div>
                <div><Label htmlFor="bm-t">Time cap</Label><Input id="bm-t" type="number" min={1} max={300} placeholder="min" value={form.timeCapMin} onChange={(e) => setForm({ ...form, timeCapMin: e.target.value })} /></div>
              </div>
              <div><Label htmlFor="bm-c">Movimentos (um por linha)</Label>
                <textarea id="bm-c" rows={6} maxLength={2000} className="w-full rounded-lg border border-borda p-2 text-sm" placeholder={'30 wall balls (kg: 9/6)\n30 box jumps (60/50 cm)\n400m run'} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              </div>
              <div><Label htmlFor="bm-o">Observações (Rx, adaptações, história)</Label>
                <textarea id="bm-o" rows={2} maxLength={500} className="w-full rounded-lg border border-borda p-2 text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={save} disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</Button>
              <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
