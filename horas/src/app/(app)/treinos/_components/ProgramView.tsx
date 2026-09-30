'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ChevronDown, Sparkles, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { formatDateBR, weekdayOf, WEEKDAYS } from '@/domain/dates';
import { HORIZON_LABEL, PROGRAM_KINDS, horizon } from '@/domain/programming/ai-program';
import type { ProgramDayResult, ProgramView as Program } from '@/server/ai/program-generator';
import { cn } from '@/lib/cn';
import { deleteProgramAction, generateProgramDayAction, insertProgramDaysAction } from './ai-actions';
import { PlanDetails } from './AiGenerator';

const INT_TONE = { LOW: 'green', MODERATE: 'blue', HIGH: 'amber', 'VERY HIGH': 'red' } as const;
const dayLabel = (d: string) => `${WEEKDAYS[weekdayOf(d) - 1]!.short} ${formatDateBR(d).slice(0, 5)}`;

export function ProgramView({ program, slug, modality, enabled }: { program: Program; slug: string; modality: string; enabled: boolean }) {
  const router = useRouter();
  const [days, setDays] = useState<Record<string, ProgramDayResult>>(program.days);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ week?: number; date?: string; label: string } | null>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [links, setLinks] = useState<string[]>([]);
  const p = program.plan;
  const total = p.semanas.reduce((s, w) => s + w.dias.length, 0);
  const done = Object.keys(days).length;

  async function generate(dates: string[], week?: number) {
    setMsg({});
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i]!;
      setBusy({ week, date: d, label: `Gerando ${dayLabel(d)}${dates.length > 1 ? ` (${i + 1}/${dates.length})` : ''}… até 1–2 min por aula` });
      const r = await generateProgramDayAction(program.id, d);
      if (!r.ok) { setBusy(null); return setMsg({ error: `${dayLabel(d)}: ${r.error}` }); }
      setDays((x) => ({ ...x, [d]: r.data }));
      if (dates.length === 1) setOpen(d);
    }
    setBusy(null);
    setMsg({ ok: dates.length > 1 ? `Semana ${week} gerada: ${dates.length} aulas.` : `Aula de ${dayLabel(dates[0]!)} gerada.` });
  }

  async function insert(dates: string[], week: number, replace = false): Promise<void> {
    setMsg({});
    setBusy({ week, label: 'Lançando no Cadastro de Treino…' });
    const r = await insertProgramDaysAction(program.id, dates, replace);
    setBusy(null);
    if (!r.ok) {
      if (!replace && /Confirme para substituir/.test(r.error) && confirm(`${r.error}\n\nSubstituir pelos treinos da planilha?`)) return insert(dates, week, true);
      return setMsg({ error: r.error });
    }
    setLinks(r.data.weekIds);
    setMsg({ ok: `Semana ${week}: ${r.data.inserted} aula(s) lançadas no Cadastro de Treino.` });
  }

  async function remove() {
    if (!confirm(`Excluir a planilha "${program.title}"? As aulas já lançadas no Cadastro de Treino continuam lá.`)) return;
    const r = await deleteProgramAction(slug, program.id);
    if (!r.ok) return setMsg({ error: r.error });
    router.push(`/treinos/${slug}/ia?modo=planilha`);
  }

  return (
    <>
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="navy">{PROGRAM_KINDS.find((k) => k.id === program.kind)?.label}</Badge>
          <Badge tone="blue">{HORIZON_LABEL[horizon(program.request)]}</Badge>
          <span className="text-sm text-tinta-suave">{formatDateBR(program.startDate)} a {formatDateBR(program.endDate)} · {total} aulas · modelo: <b className="text-tinta">{p.modelo}</b></span>
          <span className="flex-1" />
          <span className="text-sm font-semibold tabular-nums text-tinta">{done}/{total} aulas geradas</span>
          <Button variant="ghost" size="sm" onClick={remove}><Trash2 /> Excluir</Button>
        </div>
        <p className="mt-3 text-sm text-tinta">{p.estrategia}</p>
        {p.objetivoFinal && <p className="mt-1 text-sm text-tinta"><b>Objetivo final:</b> {p.objetivoFinal}</p>}
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <p className="text-xs font-bold uppercase tracking-wide text-tinta-suave">Fases</p>
            <table className="mt-1 w-full text-sm">
              <tbody className="divide-y divide-borda">
                {p.fases.map((f) => (
                  <tr key={f.nome}><td className="py-1 pr-3 font-bold text-navy">{f.nome}</td><td className="py-1 pr-3 text-tinta-suave">sem. {f.semanas}</td><td className="py-1 text-tinta">{f.objetivo}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.testes.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-tinta-suave">Testes e marcos</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-tinta">{p.testes.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-nacao">Por que esta estratégia</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-tinta">{p.decisoes.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </details>
      </Card>

      {!enabled && <Card className="mb-4 border-atencao/40 p-4 text-sm">A geração por IA não está configurada neste servidor (falta <code>ANTHROPIC_API_KEY</code>).</Card>}
      <FormMessage error={msg.error} success={msg.ok} />
      {busy && <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-nacao"><Sparkles className="size-4 animate-pulse" /> {busy.label}</p>}
      {links.length > 0 && (
        <p className="mb-3 text-sm">{links.map((id) => <Link key={id} className="mr-3 font-semibold text-nacao hover:underline" href={`/treinos/${id}`}>Abrir a semana no Cadastro de Treino →</Link>)}</p>
      )}

      <div className="space-y-3">
        {p.semanas.map((w) => {
          const pending = w.dias.filter((d) => !days[d.data]).map((d) => d.data);
          const ready = w.dias.filter((d) => days[d.data]).map((d) => d.data);
          return (
            <Card key={w.semana} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold text-navy">Semana {w.semana}</h2>
                <span className="text-sm font-semibold text-tinta">{w.fase}</span>
                <span className="text-sm text-tinta-suave">· {w.foco}</span>
                <Badge tone="neutral">volume {w.volume}</Badge>
                <Badge tone="neutral">intensidade {w.intensidade}</Badge>
                {w.deload && <Badge tone="cyan">deload</Badge>}
                <span className="flex-1" />
                <Button size="sm" variant={pending.length ? 'primary' : 'ghost'} disabled={!!busy || !enabled || !pending.length} onClick={() => generate(pending, w.semana)}>
                  <Sparkles /> {pending.length ? `Gerar aulas (${pending.length})` : 'Aulas geradas'}
                </Button>
                <Button size="sm" variant="secondary" disabled={!!busy || !ready.length} onClick={() => insert(ready, w.semana)}>
                  <Upload /> Lançar semana
                </Button>
              </div>
              <div className="mt-3 divide-y divide-borda">
                {w.dias.map((d) => {
                  const r = days[d.data];
                  const isOpen = open === d.data;
                  return (
                    <div key={d.data} className="py-2">
                      <div className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
                        <span className="w-20 shrink-0 font-bold text-navy">{dayLabel(d.data)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-tinta">{d.tema}</p>
                          <p className="text-tinta-suave">{d.forca ? <><b>Força:</b> {d.forca} · </> : null}<b>WOD:</b> {d.wod}</p>
                        </div>
                        <Badge tone={INT_TONE[d.intensidade]}>{d.intensidade}</Badge>
                        {r ? (
                          <button className="flex items-center gap-1 font-semibold text-nacao" onClick={() => setOpen(isOpen ? null : d.data)}>
                            <CheckCircle2 className="size-4 text-emerald-600" /> {isOpen ? 'Fechar' : 'Ver aula'} <ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} />
                          </button>
                        ) : (
                          <Button size="sm" variant="ghost" disabled={!!busy || !enabled} onClick={() => generate([d.data], w.semana)}><Sparkles /> Gerar</Button>
                        )}
                      </div>
                      {r && isOpen && (
                        <div className="mt-3">
                          <PlanDetails plan={r.plan} check={r.check} date={d.data} modality={modality} model="IA">
                            <Button className="w-full" variant="ghost" disabled={!!busy || !enabled} onClick={() => generate([d.data], w.semana)}><Sparkles /> Refazer esta aula</Button>
                            <Button className="w-full" disabled={!!busy} onClick={() => insert([d.data], w.semana)}><Upload /> Lançar {formatDateBR(d.data)}</Button>
                          </PlanDetails>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
