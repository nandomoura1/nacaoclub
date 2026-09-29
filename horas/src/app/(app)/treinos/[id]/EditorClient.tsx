'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Copy, Download, FileText, Image as ImageIcon, MessageCircle, Plus, Save, Trash2, X } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { addDays, formatDateBR } from '@/domain/dates';
import {
  BLOCK_KINDS, KIND, dayName, dayTemplate, whatsappText,
  type BlockKind, type WorkoutBlockData, type WorkoutDayData,
} from '@/domain/workout';
import { cn } from '@/lib/cn';
import type { WorkoutWeekView } from '@/server/services/workout-service';
import type { BenchmarkView } from '@/server/services/benchmark-service';
import { benchmarkBlock, matchBenchmark } from '@/domain/benchmarks';
import { deleteWeekAction, saveWeekAction } from '../actions';

const empty = (kind: BlockKind): WorkoutBlockData => ({ kind, title: null, durationMin: null, format: null, timeCapMin: null, content: null, notes: null, coachNotes: null });
const QUICK: BlockKind[] = ['MOBILIDADE', 'AQUECIMENTO', 'SKILL', 'ESPECIFICO', 'CORE', 'FORCA', 'WOD', 'FUNDAMENTO', 'JOGO'];

export function EditorClient({ week, benchmarks }: { week: WorkoutWeekView; benchmarks: BenchmarkView[] }) {
  const router = useRouter();
  const [days, setDays] = useState<WorkoutDayData[]>(week.days);
  const [footer, setFooter] = useState({ footerTitle: week.footerTitle ?? '', footerText: week.footerText ?? '', footerChips: week.footerChips ?? '' });
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [text, setText] = useState<string | null>(null);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [pickQ, setPickQ] = useState('');
  const [pending, start] = useTransition();

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week.weekStart, i)), [week.weekStart]);
  const missing = weekDates.filter((d) => !days.some((x) => x.date === d));
  const touch = () => { setDirty(true); setMsg({}); };
  const setDay = (date: string, fn: (d: WorkoutDayData) => WorkoutDayData) => { setDays((all) => all.map((d) => (d.date === date ? fn(d) : d))); touch(); };
  const setBlock = (date: string, i: number, patch: Partial<WorkoutBlockData>) =>
    setDay(date, (d) => ({ ...d, blocks: d.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const current = { ...week, days, footerTitle: footer.footerTitle || null, footerText: footer.footerText || null, footerChips: footer.footerChips || null };

  const save = () => start(async () => {
    const r = await saveWeekAction(week.id, { ...footer, days });
    if (!r.ok) return setMsg({ error: r.error });
    setDirty(false);
    setMsg({ ok: 'Treinos salvos. A arte e o texto já usam esta versão.' });
    router.refresh();
  });

  return (
    <>
      {/* Barra de ações fixa */}
      <Card className="z-20 mb-4 flex flex-wrap items-center gap-2 p-3 lg:sticky lg:top-2">
        <Button onClick={save} disabled={pending || !dirty}><Save /> {pending ? 'Salvando…' : dirty ? 'Salvar' : 'Salvo'}</Button>
        <a href={dirty ? undefined : `/treinos/${week.id}/arte`} target="_blank" rel="noopener" aria-disabled={dirty}
          className={cn(buttonVariants({ variant: 'secondary' }), dirty && 'pointer-events-none opacity-50')}>
          <ImageIcon /> Arte da semana (JPG)
        </a>
        <a href={dirty ? undefined : `/treinos/${week.id}/pdf?tipo=professor`} target="_blank" rel="noopener" aria-disabled={dirty}
          className={cn(buttonVariants({ variant: 'secondary' }), dirty && 'pointer-events-none opacity-50')} title="Plano de aula completo, um dia por página, com as orientações ao professor">
          <FileText /> PDF professores
        </a>
        <a href={dirty ? undefined : `/treinos/${week.id}/pdf?tipo=aluno`} target="_blank" rel="noopener" aria-disabled={dirty}
          className={cn(buttonVariants({ variant: 'secondary' }), dirty && 'pointer-events-none opacity-50')} title="Resumo para os alunos: tempo de cada etapa e detalhe de força, técnica e WOD">
          <FileText /> PDF alunos
        </a>
        <Button variant="secondary" onClick={() => setText(whatsappText(current))}><MessageCircle /> Texto WhatsApp</Button>
        {dirty && <span className="text-xs text-atencao">Salve para gerar a arte com as mudanças.</span>}
        <div className="flex-1" />
        <Button variant="ghost" className="text-critico" disabled={pending} onClick={() => {
          if (!confirm('Excluir os treinos desta semana? Não dá para desfazer.')) return;
          start(async () => { const r = await deleteWeekAction(week.id); if (r.ok) router.push('/treinos'); else setMsg({ error: r.error }); });
        }}><Trash2 /> Excluir semana</Button>
      </Card>
      <FormMessage error={msg.error} success={msg.ok} />

      {/* Celular: Salvar sempre à mão, acima da barra inferior. */}
      {dirty && (
        <Button onClick={save} disabled={pending} className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 shadow-lg lg:hidden">
          <Save /> {pending ? 'Salvando…' : 'Salvar'}
        </Button>
      )}

      <div className="mt-3 grid gap-4 xl:grid-cols-2">
        {days.map((d) => (
          <Card key={d.date} className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-extrabold text-navy">{dayName(d.date)} · {formatDateBR(d.date).slice(0, 5)}</h3>
              <Input className="h-8 w-40 text-sm" placeholder="Destaque (opcional)" value={d.title ?? ''} maxLength={40}
                onChange={(e) => setDay(d.date, (x) => ({ ...x, title: e.target.value || null }))} />
              <div className="flex-1" />
              {d.blocks.length > 0 && !dirty && (
                <a href={`/treinos/${week.id}/arte?dia=${d.date}`} target="_blank" rel="noopener" className={buttonVariants({ variant: 'ghost', size: 'sm' })}><Download /> Arte do dia</a>
              )}
              {d.blocks.length > 0 && !dirty && (
                <a href={`/treinos/${week.id}/pdf?tipo=professor&dia=${d.date}`} target="_blank" rel="noopener" className={buttonVariants({ variant: 'ghost', size: 'sm' })}><FileText /> Plano do dia</a>
              )}
              <Button variant="ghost" size="sm" onClick={() => setText(whatsappText(current, d.date))}><MessageCircle /> Texto do dia</Button>
              <Button variant="ghost" size="sm" aria-label="Remover dia" onClick={() => { if (!d.blocks.length || confirm('Remover este dia e seus blocos?')) { setDays((all) => all.filter((x) => x.date !== d.date)); touch(); } }}><X /></Button>
            </div>

            {d.blocks.length === 0 && (
              <button className="mb-3 w-full rounded-lg border border-dashed border-nacao/40 p-3 text-sm font-semibold text-nacao hover:bg-nacao/5"
                onClick={() => setDay(d.date, (x) => ({ ...x, blocks: dayTemplate(week.modality) }))}>
                Começar com a estrutura padrão de {week.modality}
              </button>
            )}

            <div className="space-y-3">
              {d.blocks.map((b, i) => (
                <BlockEditor key={i} b={b}
                  onChange={(p) => setBlock(d.date, i, p)}
                  onRemove={() => setDay(d.date, (x) => ({ ...x, blocks: x.blocks.filter((_, j) => j !== i) }))}
                  onMove={(dir) => setDay(d.date, (x) => {
                    const bl = [...x.blocks]; const j = i + dir;
                    if (j < 0 || j >= bl.length) return x;
                    [bl[i], bl[j]] = [bl[j]!, bl[i]!];
                    return { ...x, blocks: bl };
                  })} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {QUICK.map((k) => (
                <button key={k} onClick={() => setDay(d.date, (x) => ({ ...x, blocks: [...x.blocks, empty(k)] }))}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-tinta-suave ring-1 ring-borda hover:text-nacao hover:ring-nacao/40">
                  + {KIND[k].label}
                </button>
              ))}
              <button onClick={() => { setPickQ(''); setPickFor(d.date); }}
                className="rounded-full bg-nacao/10 px-2.5 py-1 text-[11px] font-bold text-nacao ring-1 ring-nacao/30 hover:bg-nacao/15">
                🏆 + Benchmark
              </button>
            </div>
          </Card>
        ))}
      </div>

      {missing.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
          Adicionar dia:
          {missing.map((d) => (
            <Button key={d} variant="secondary" size="sm" onClick={() => { setDays((all) => [...all, { date: d, title: null, blocks: [] }].sort((a, b) => a.date.localeCompare(b.date))); touch(); }}>
              <Plus /> {dayName(d)} {formatDateBR(d).slice(0, 5)}
            </Button>
          ))}
        </div>
      )}

      <Card className="mt-4 p-4">
        <h3 className="mb-1 font-extrabold text-navy">Rodapé: novidade da Nação (opcional)</h3>
        <p className="mb-3 text-xs text-tinta-suave">Vazio = rodapé padrão com o slogan. Destaques: um por linha, no formato <b>Rótulo|Valor</b> (ex.: <code>Aulão HYROX|8H 9H 10H</code>), no máximo 4.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <div><Label htmlFor="f-t">Título</Label><Input id="f-t" maxLength={60} placeholder="Ex.: ClubFit" value={footer.footerTitle} onChange={(e) => { setFooter({ ...footer, footerTitle: e.target.value }); touch(); }} /></div>
          <div><Label htmlFor="f-x">Texto</Label><textarea id="f-x" maxLength={240} rows={3} className="w-full rounded-lg border border-borda p-2 text-sm" placeholder="Ex.: A partir de 1º de outubro…" value={footer.footerText} onChange={(e) => { setFooter({ ...footer, footerText: e.target.value }); touch(); }} /></div>
          <div><Label htmlFor="f-c">Destaques</Label><textarea id="f-c" maxLength={300} rows={3} className="w-full rounded-lg border border-borda p-2 font-mono text-xs" placeholder={'Aulão CrossFit|7H\nAulão HYROX|8H 9H 10H'} value={footer.footerChips} onChange={(e) => { setFooter({ ...footer, footerChips: e.target.value }); touch(); }} /></div>
        </div>
      </Card>

      {pickFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4" onClick={() => setPickFor(null)}>
          <Card className="flex max-h-[85dvh] w-full max-w-lg flex-col p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 font-extrabold text-navy">Benchmark para {dayName(pickFor)} {formatDateBR(pickFor).slice(0, 5)}</h3>
            <Input autoFocus placeholder="Buscar: Fran, Murph, thruster, AMRAP…" value={pickQ} onChange={(e) => setPickQ(e.target.value)} aria-label="Buscar benchmark" />
            <div className="mt-3 min-h-0 flex-1 divide-y divide-borda overflow-y-auto">
              {benchmarks.filter((b) => matchBenchmark(b, pickQ)).map((b) => (
                <button key={b.id} className="block w-full px-1 py-2 text-left hover:bg-fundo"
                  onClick={() => { setDay(pickFor, (x) => ({ ...x, blocks: [...x.blocks, benchmarkBlock(b)] })); setPickFor(null); setMsg({ ok: `${b.name} entrou como WOD. Ajuste o tempo e salve.` }); }}>
                  <span className="font-bold text-navy">{b.name}</span>
                  <span className="ml-2 text-xs font-semibold text-nacao">{b.format}</span>
                  <span className="block truncate text-xs text-tinta-suave">{b.content.split('\n').join(' · ')}</span>
                </button>
              ))}
            </div>
            <Button variant="ghost" className="mt-3 self-start" onClick={() => setPickFor(null)}>Fechar</Button>
          </Card>
        </div>
      )}

      {text !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4" onClick={() => setText(null)}>
          <Card className="w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 font-extrabold text-navy">Texto para WhatsApp</h3>
            <textarea readOnly value={text} rows={18} className="w-full rounded-lg border border-borda bg-fundo p-3 font-mono text-xs" />
            <div className="mt-3 flex gap-2">
              <Button onClick={async () => { await navigator.clipboard.writeText(text); setMsg({ ok: 'Texto copiado. É só colar no grupo.' }); setText(null); }}><Copy /> Copiar</Button>
              <Button variant="ghost" onClick={() => setText(null)}>Fechar</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function BlockEditor({ b, onChange, onRemove, onMove }: {
  b: WorkoutBlockData; onChange: (p: Partial<WorkoutBlockData>) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const k = KIND[b.kind];
  const num = (v: string) => (v === '' ? null : Math.max(1, Math.min(300, Number(v) || 0)) || null);
  return (
    <div className={cn('rounded-lg border p-3', k.detailed ? 'border-nacao/30 bg-nacao/[0.03]' : 'border-borda')}>
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Tipo de bloco" className="h-8 w-40 text-sm font-semibold" value={b.kind} onChange={(e) => onChange({ kind: e.target.value as BlockKind })}>
          {BLOCK_KINDS.map((x) => <option key={x.kind} value={x.kind}>{x.label}</option>)}
        </Select>
        <div className="flex items-center gap-1">
          <Input aria-label="Duração (min)" className="h-8 w-16 text-sm" type="number" min={1} max={300} placeholder="min" value={b.durationMin ?? ''} onChange={(e) => onChange({ durationMin: num(e.target.value) })} />
          <span className="text-xs text-tinta-fraca">min</span>
        </div>
        {k.detailed && (
          <Input aria-label="Nome" className="h-8 min-w-40 flex-1 text-sm" maxLength={80} placeholder={b.kind === 'FORCA' ? 'Exercício: Snatch complex' : b.kind === 'SKILL' || b.kind === 'ESPECIFICO' ? 'Técnica: Double under (opcional)' : "Nome do WOD: O'Connor (opcional)"} value={b.title ?? ''} onChange={(e) => onChange({ title: e.target.value || null })} />
        )}
        <div className="ml-auto flex">
          <button className="p-1 text-tinta-fraca hover:text-navy" aria-label="Subir" onClick={() => onMove(-1)}><ArrowUp className="size-4" /></button>
          <button className="p-1 text-tinta-fraca hover:text-navy" aria-label="Descer" onClick={() => onMove(1)}><ArrowDown className="size-4" /></button>
          <button className="p-1 text-tinta-fraca hover:text-critico" aria-label="Remover bloco" onClick={onRemove}><X className="size-4" /></button>
        </div>
      </div>
      {k.detailed ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_7rem]">
          <Input aria-label="Formato" className="h-8 text-sm" maxLength={120} placeholder={b.kind === 'FORCA' ? 'Esquema: 5x5 · EMOM 8\' · a cada 2\'' : 'Formato: For time · AMRAP 18\' · EMOM 25\''} value={b.format ?? ''} onChange={(e) => onChange({ format: e.target.value || null })} />
          <Input aria-label="Time cap (min)" className="h-8 text-sm" type="number" min={1} max={300} placeholder="Time cap" value={b.timeCapMin ?? ''} onChange={(e) => onChange({ timeCapMin: num(e.target.value) })} />
          <textarea aria-label="Movimentos" rows={Math.max(3, (b.content ?? '').split('\n').length + 1)} maxLength={2000}
            className="rounded-lg border border-borda p-2 text-sm sm:col-span-2"
            placeholder={'Um movimento por linha:\n15 thrusters (kg: 43/29)\n15 pull-ups\n400m run'}
            value={b.content ?? ''} onChange={(e) => onChange({ content: e.target.value || null })} />
          <Input aria-label="Observação" className="h-8 text-sm sm:col-span-2" maxLength={300} placeholder="Observação para todos (opcional): *Divide everything however you like" value={b.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value || null })} />
        </div>
      ) : (
        <textarea aria-label="Roteiro" rows={Math.max(3, (b.content ?? '').split('\n').length + 1)} maxLength={2000}
          className="mt-2 w-full rounded-lg border border-borda p-2 text-sm"
          placeholder={'Roteiro (só no plano do professor; o aluno vê apenas o tempo):\n2x 10 air squats\n200m run'}
          value={b.content ?? ''} onChange={(e) => onChange({ content: e.target.value || null })} />
      )}
      <textarea aria-label="Orientações ao professor" rows={Math.max(2, (b.coachNotes ?? '').split('\n').length)} maxLength={1000}
        className="mt-2 w-full rounded-lg border border-dashed border-atencao/50 bg-atencao/[0.04] p-2 text-xs"
        placeholder="🧑‍🏫 Orientações ao professor (não vai para os alunos): cues, escalas, progressões, organização da turma"
        value={b.coachNotes ?? ''} onChange={(e) => onChange({ coachNotes: e.target.value || null })} />
    </div>
  );
}
