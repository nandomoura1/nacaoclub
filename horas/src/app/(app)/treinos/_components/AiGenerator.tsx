'use client';

import { Fragment, useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle2, CircleAlert, Sparkles, TriangleAlert, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { formatDateBR, weekdayOf, WEEKDAYS } from '@/domain/dates';
import { KIND, type BlockKind } from '@/domain/workout';
import type { GenerateResult } from '@/server/ai/workout-generator';
import { cn } from '@/lib/cn';
import { isTechnicalSlug, levelLabels } from '@/domain/programming/modalities';
import { generateWorkoutAction, insertAiDayAction } from './ai-actions';

type Form = { date: string; focus: string; strength: 'auto' | 'sim' | 'nao'; wodMinutes: 'auto' | 'curto' | 'medio' | 'longo'; partner: boolean; avoid: string; window: 14 | 30 };

const ALERT_STYLE = {
  ok: { icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
  aviso: { icon: CircleAlert, cls: 'border-amber-200 bg-amber-50 text-amber-900' },
  alerta: { icon: TriangleAlert, cls: 'border-red-200 bg-red-50 text-red-900' },
};

export function AiGenerator({ slug, modality, defaultDate, enabled }: { slug: string; modality: string; defaultDate: string; enabled: boolean }) {
  const [f, setF] = useState<Form>({ date: defaultDate, focus: '', strength: 'auto', wodMinutes: 'auto', partner: false, avoid: '', window: 14 });
  const [result, setResult] = useState<(GenerateResult & { date: string }) | null>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [weekId, setWeekId] = useState<string | null>(null);
  const [generating, startGen] = useTransition();
  const [saving, startSave] = useTransition();

  const generate = () => startGen(async () => {
    setMsg({});
    setWeekId(null);
    const r = await generateWorkoutAction(slug, f);
    if (!r.ok) return setMsg({ error: r.error });
    setResult({ ...r.data, date: f.date });
  });

  function insert(replace: boolean): void {
    if (!result) return;
    startSave(async () => {
      setMsg({});
      const r = await insertAiDayAction(slug, result.date, result.plan, replace);
      if (!r.ok) {
        if (!replace && /já tem treino/.test(r.error) && confirm(`${r.error}\n\nSubstituir pelo treino gerado?`)) return insert(true);
        return setMsg({ error: r.error });
      }
      setWeekId(r.data);
      setMsg({ ok: `Treino de ${formatDateBR(result.date)} lançado no Cadastro de Treino.` });
    });
  }

  const wd = WEEKDAYS[weekdayOf(f.date) - 1]?.long;
  const technical = isTechnicalSlug(slug);
  const p = result?.plan;
  const c = result?.check;

  return (
    <>
      {!enabled && (
        <Card className="mb-4 border-atencao/40 p-4 text-sm text-tinta">
          <b>A geração por IA ainda não está ligada neste servidor.</b> Falta configurar a variável <code>ANTHROPIC_API_KEY</code> no ambiente (Vercel → Settings → Environment Variables). O restante da tela já funciona.
        </Card>
      )}

      <Card className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); generate(); }}>
          <div>
            <Label htmlFor="ai-date">Dia da aula</Label>
            <Input id="ai-date" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            {wd && <p className="mt-1 text-xs text-tinta-suave">{wd}</p>}
          </div>
          {!technical && <div>
            <Label htmlFor="ai-str">Força</Label>
            <Select id="ai-str" value={f.strength} onChange={(e) => setF({ ...f, strength: e.target.value as Form['strength'] })}>
              <option value="auto">Automático (DNA do dia)</option>
              <option value="sim">Com bloco de força</option>
              <option value="nao">Sem força</option>
            </Select>
          </div>}
          {!technical && <div>
            <Label htmlFor="ai-wod">Duração do WOD</Label>
            <Select id="ai-wod" value={f.wodMinutes} onChange={(e) => setF({ ...f, wodMinutes: e.target.value as Form['wodMinutes'] })}>
              <option value="auto">Automático (variar)</option>
              <option value="curto">Curto (até 10')</option>
              <option value="medio">Médio (11–20')</option>
              <option value="longo">Longo (21'+)</option>
            </Select>
          </div>}
          <div>
            <Label htmlFor="ai-win">Baseado nos últimos</Label>
            <Select id="ai-win" value={f.window} onChange={(e) => setF({ ...f, window: Number(e.target.value) as Form['window'] })}>
              <option value={14}>14 dias de treinos</option>
              <option value={30}>30 dias de treinos</option>
            </Select>
            {!technical && <label className="mt-2 flex items-center gap-2 text-sm text-tinta">
              <input type="checkbox" className="accent-[#0169E9]" checked={f.partner} onChange={(e) => setF({ ...f, partner: e.target.checked })} />
              WOD em dupla
            </label>}
          </div>
          <div className={technical ? 'sm:col-span-2 lg:col-span-1' : 'sm:col-span-2'}>
            <Label htmlFor="ai-focus">{technical ? 'Tema / fundamento (opcional)' : 'Foco do dia (opcional)'}</Label>
            <Input id="ai-focus" maxLength={400} placeholder={technical ? 'Ex.: recepção de saque com deslocamento; defesa e contra-ataque' : 'Ex.: semana 3 do ciclo de back squat; trabalhar HSPU; treino de 15 minutos'} value={f.focus} onChange={(e) => setF({ ...f, focus: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="ai-avoid">Evitar (opcional)</Label>
            <Input id="ai-avoid" maxLength={300} placeholder={technical ? 'Ex.: ataque de cabeça (turma iniciante)' : 'Ex.: corrida (chuva), rope climb'} value={f.avoid} onChange={(e) => setF({ ...f, avoid: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={generating || !enabled}>
              <Sparkles /> {generating ? 'Gerando… (até 1–2 min)' : result ? 'Gerar outra opção' : 'Gerar treino'}
            </Button>
          </div>
        </form>
      </Card>

      <FormMessage error={msg.error} success={msg.ok} />
      {weekId && <p className="mb-4 text-sm"><Link className="font-semibold text-nacao hover:underline" href={`/treinos/${weekId}`}>Abrir a semana no Cadastro de Treino →</Link></p>}

      {p && c && result && (
        <PlanDetails plan={p} check={c} date={result.date} slug={slug} modality={modality} model={result.model}>
          <Button className="w-full" disabled={saving} onClick={() => insert(false)}>
            <Upload /> {saving ? 'Lançando…' : `Lançar em ${formatDateBR(result.date)}`}
          </Button>
        </PlanDetails>
      )}
    </>
  );
}

/** Aula gerada: blocos, escalas, conferência do motor e o porquê. `children` = ações (lançar). */
export function PlanDetails({ plan: p, check: c, date, slug, modality, model, children }: {
  plan: GenerateResult['plan']; check: GenerateResult['check']; date: string; slug: string; modality: string; model: string; children?: React.ReactNode;
}) {
  const technical = isTechnicalSlug(slug);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="min-w-0 space-y-3 lg:col-span-2">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">{modality} · {WEEKDAYS[weekdayOf(date) - 1]!.long} {formatDateBR(date)}</p>
          <h2 className="text-xl font-extrabold text-navy">{p.titulo}</h2>
          <p className="mt-1 text-sm text-tinta"><b>Objetivo:</b> {p.objetivo}</p>
          <p className="text-sm text-tinta"><b>{technical ? 'Conceito' : 'Estímulo'}:</b> {p.estimulo}</p>
        </Card>
        {p.blocos.map((b, i) => (
          <Card key={i} className="p-4">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xs font-bold uppercase tracking-wide text-nacao">{KIND[b.tipo as BlockKind]?.label ?? b.tipo}</span>
              <span className="text-xs font-semibold tabular-nums text-tinta-suave">{b.minutos}'</span>
              {b.titulo && <h3 className="font-extrabold text-navy">{b.titulo}</h3>}
              {b.formato && <span className="text-sm font-semibold text-tinta">{b.formato}{b.timeCapMin ? ` · cap ${b.timeCapMin}'` : ''}</span>}
            </div>
            {b.conteudo.length > 0 && <ul className="mt-2 space-y-0.5 text-sm text-tinta">{b.conteudo.map((l, j) => <li key={j}>{l}</li>)}</ul>}
            {b.notasAluno && <p className="mt-2 text-sm text-tinta-suave">{b.notasAluno}</p>}
            {b.orientacoesProfessor && <p className="mt-2 rounded-lg bg-fundo p-2 text-sm text-tinta"><b>Professor:</b> {b.orientacoesProfessor}</p>}
          </Card>
        ))}
        <Card className="p-4">
          <h3 className="font-extrabold text-navy">{technical ? 'Níveis' : 'Escalas'}</h3>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {levelLabels(slug).map(([k, label]) => <div key={k}><dt className="text-xs font-bold uppercase text-tinta-suave">{label}</dt><dd className="text-sm text-tinta">{p.escalas[k]}</dd></div>)}
          </dl>
        </Card>
      </div>

      <div className="min-w-0 space-y-3">
        <Card className="p-4">
          <h3 className="font-extrabold text-navy">Conferência do motor</h3>
          <p className="mb-2 text-xs text-tinta-suave">{technical ? 'Tempo de aula contra a referência da Nação.' : 'Tempo de aula, volume e fadiga contra os dias programados e a referência da Nação.'}</p>
          <ul className="space-y-2">
            {c.alerts.map((a, i) => {
              const S = ALERT_STYLE[a.level];
              return (
                <li key={i} className={cn('flex gap-2 rounded-lg border p-2 text-sm', S.cls)}>
                  <S.icon className="mt-0.5 size-4 shrink-0" />
                  <span><b>{a.title}.</b> {a.text}</span>
                </li>
              );
            })}
          </ul>
          {c.wod && (
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-tinta-suave">WOD</dt><dd className="text-right font-semibold">{c.wod.minutes ?? '–'}' {c.wod.domainLabel ? `· ${c.wod.domainLabel}` : ''}</dd>
              <dt className="text-tinta-suave">Repetições</dt><dd className="text-right font-semibold tabular-nums">{c.wod.reps}{c.wod.kind === 'estimado' ? ' (est.)' : ''}</dd>
              {c.wod.runM > 0 && <><dt className="text-tinta-suave">Corrida</dt><dd className="text-right font-semibold tabular-nums">{c.wod.runM} m</dd></>}
              {c.wod.ergCal > 0 && <><dt className="text-tinta-suave">Ergômetros</dt><dd className="text-right font-semibold tabular-nums">{c.wod.ergCal} cal</dd></>}
              {c.wod.patterns.map((pt) => <Fragment key={pt.id}><dt className="text-tinta-suave">{pt.label}</dt><dd className="text-right font-semibold tabular-nums">{pt.value}</dd></Fragment>)}
            </dl>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="font-extrabold text-navy">Por que este treino</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-tinta">{p.decisoes.map((d, i) => <li key={i}>{d}</li>)}</ul>
          <p className="mt-2 text-xs text-tinta-fraca">Gerado por {model}. A IA propõe; o coach decide e pode editar tudo no Cadastro de Treino.</p>
        </Card>
        {children}
      </div>
    </div>
  );
}
