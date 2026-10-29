'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, CheckCircle2, FileSpreadsheet, Lock, MessageCircle, Printer, Send, TriangleAlert, Unlock, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { formatClock, formatDateBR, parseClock, WEEKDAYS, type IsoDate } from '@/domain/dates';
import { BOND_LABEL, CELL_LABEL, CELL_TONE, STATUS_LABEL, cellText, fmtHours } from '@/domain/escalas/labels';
import type { Alert, Cell, CellKind } from '@/domain/escalas/types';
import { CLASSIFICATION_LABEL } from '@/domain/escalas/validate';
import { cn } from '@/lib/cn';
import type { MonthView } from '@/server/services/ws-service';
import { confirmDayAction, editCellAction, generateAction, sendMemberScheduleAction, sendTeamSchedulesAction, setStatusAction, swapCellsAction, wsWhatsAppStatusAction } from './actions';
import { memberScheduleText } from '@/domain/escalas/whatsapp';
import { TopScroll } from '@/components/ui/top-scroll';

const KINDS: CellKind[] = ['TRABALHO', 'FOLGA', 'BANCO', 'FERIAS', 'ATESTADO', 'FALTA', 'AFASTAMENTO', 'INDISPONIVEL', 'FECHADO', 'SEM_GRADE'];
const LEVEL_TONE = { CONFLITO: 'red', AJUSTE: 'amber', INFO: 'neutral' } as const;
const CLASS_TONE = { SEM_CONFLITOS: 'border-sucesso/40 bg-sucesso/10 text-sucesso', AJUSTES: 'border-atencao/40 bg-atencao/10 text-atencao', COM_CONFLITO: 'border-critico/40 bg-critico/10 text-critico' } as const;

export function GenerateButton({ sectorId, year, month, exists, disabled }: { sectorId: string; year: number; month: number; exists: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button size="lg" disabled={pending || disabled} onClick={() => {
        if (exists && !confirm('Gerar de novo refaz o rascunho inteiro (as edições manuais deste mês se perdem). Continuar?')) return;
        start(async () => {
          const r = await generateAction(sectorId, year, month);
          if (!r.ok) setError(r.error); else { setError(null); router.refresh(); }
        });
      }}>
        <Wand2 /> {pending ? 'Gerando…' : exists ? 'GERAR DE NOVO' : 'GERAR ESCALA'}
      </Button>
      <FormMessage error={error} />
    </div>
  );
}

export function ScheduleClient({ view }: { view: MonthView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'mes' | 'semana'>('mes');
  const [week, setWeek] = useState(0);
  const [edit, setEdit] = useState<{ memberId: string; date: IsoDate } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [wa, setWa] = useState<{ configured: boolean; testMode: boolean } | null>(null);
  const [waMember, setWaMember] = useState<string | null>(null);
  const [teamMsg, setTeamMsg] = useState<string | null>(null);
  useEffect(() => { let alive = true; wsWhatsAppStatusAction().then((r) => alive && setWa(r)).catch(() => undefined); return () => { alive = false; }; }, []);
  const canWa = !!wa?.configured && view.can.edit;
  const sendTeam = () => {
    const withPhone = members.filter((m) => m.active && m.hasPhone && view.month.days.some((d) => view.grid[m.id]?.[d]?.kind === 'TRABALHO')).length;
    if (!confirm(`Enviar a escala de ${view.month.label} pelo WhatsApp para ${withPhone} pessoa(s) com telefone no cadastro?${s.status === 'RASCUNHO' ? ' A escala ainda é rascunho: a mensagem vai como prévia.' : ''}`)) return;
    start(async () => {
      const r = await sendTeamSchedulesAction(s.id);
      if (!r.ok) { setError(r.error); return; }
      const d = r.data;
      setTeamMsg([`Enviado para ${d.sent.length}: ${d.sent.join(', ') || '—'}${d.testMode ? ' (modo teste: tudo foi para o número de teste)' : ''}.`, d.noPhone.length ? `Sem telefone no cadastro: ${d.noPhone.join(', ')}.` : '', d.failed.length ? `Falhou: ${d.failed.join(', ')}.` : ''].filter(Boolean).join(' '));
    });
  };
  const s = view.schedule!;
  const a = view.analysis!;
  const editable = s.status === 'RASCUNHO' && view.can.edit;
  const weeks = view.month.weeks.map((w) => w.days.filter((d) => d >= view.month.first && d <= view.month.last));
  const days = mode === 'mes' ? view.month.days : weeks[Math.min(week, weeks.length - 1)]!;
  const dayPlan = useMemo(() => new Map(view.days.map((d) => [d.date, d])), [view.days]);
  const conflictAt = useMemo(() => {
    const m = new Map<string, Alert[]>();
    for (const x of a.alerts) if (x.memberId && x.date && x.level !== 'INFO') m.set(`${x.memberId}|${x.date}`, [...(m.get(`${x.memberId}|${x.date}`) ?? []), x]);
    return m;
  }, [a.alerts]);
  const uncoveredAt = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const u of a.uncovered) m.set(u.date, [...(m.get(u.date) ?? []), `${u.post}: falta ${u.missing}`]);
    return m;
  }, [a.uncovered]);
  const stats = new Map(a.members.map((x) => [x.memberId, x]));
  const members = view.members.filter((m) => m.active || Object.keys(view.grid[m.id] ?? {}).some((d) => d >= view.month.first));
  const conflictCount = a.alerts.filter((x) => x.level === 'CONFLITO').length;
  const status = (to: 'RASCUNHO' | 'APROVADA' | 'PUBLICADA') => {
    let accept: { reason: string } | undefined;
    if (to !== 'RASCUNHO' && conflictCount) {
      const reason = prompt(`A escala tem ${conflictCount} conflito(s) (veja os alertas). Para ${to === 'PUBLICADA' ? 'publicar' : 'aprovar'} mesmo assim, escreva a justificativa (ex.: "abertura das 05h coberta à mão"):`);
      if (reason === null) return;
      accept = { reason };
    }
    doStatus(to, accept);
  };
  const doStatus = (to: 'RASCUNHO' | 'APROVADA' | 'PUBLICADA', accept?: { reason: string }) => start(async () => {
    const r = await setStatusAction(s.id, to, accept);
    if (!r.ok) setError(r.error); else { setError(null); router.refresh(); }
  });
  const alerts = showAll ? a.alerts : a.alerts.slice(0, 12);
  const mes = `${view.month.year}-${String(view.month.month).padStart(2, '0')}`;
  const next = view.month.month === 12 ? `${view.month.year + 1}-01` : `${view.month.year}-${String(view.month.month + 1).padStart(2, '0')}`;

  return (
    <div className="space-y-4">
      <div className={cn('flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3', CLASS_TONE[a.classification])}>
        {a.classification === 'SEM_CONFLITOS' ? <CheckCircle2 className="size-5" /> : <TriangleAlert className="size-5" />}
        <div className="flex-1">
          <p className="font-extrabold uppercase tracking-wide">{CLASSIFICATION_LABEL[a.classification]}</p>
          <p className="text-xs opacity-90">
            {a.classification === 'SEM_CONFLITOS' && 'A escala atende às regras cadastradas e à cobertura exigida.'}
            {a.classification === 'AJUSTES' && 'Há pendências ou preferências não atendidas (veja os alertas).'}
            {a.classification === 'COM_CONFLITO' && 'Há falha de cobertura, descanso ou regra obrigatória. Dá para aprovar/publicar assim com uma justificativa (fica no histórico).'}
          </p>
        </div>
        <Badge tone={s.status === 'PUBLICADA' ? 'green' : s.status === 'APROVADA' ? 'blue' : 'neutral'}>{STATUS_LABEL[s.status]}</Badge>
      </div>
      {s.accepted && (
        <p className="rounded-lg bg-atencao/10 px-3 py-2 text-xs text-tinta">
          <b>{s.accepted.status === 'PUBLICADA' ? 'Publicada' : 'Aprovada'} com {s.accepted.count} conflito(s)</b> por {s.accepted.by} em {new Date(s.accepted.at).toLocaleString('pt-BR')}: “{s.accepted.reason}”
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {view.can.publish && s.status === 'RASCUNHO' && <Button disabled={pending} onClick={() => status('APROVADA')}><CheckCircle2 /> {conflictCount ? 'Aprovar com conflito' : 'Aprovar'}</Button>}
        {view.can.publish && s.status === 'APROVADA' && <Button disabled={pending} onClick={() => status('PUBLICADA')}><Send /> {conflictCount ? 'Publicar com conflito' : 'Publicar'}</Button>}
        {view.can.publish && s.status !== 'RASCUNHO' && <Button variant="secondary" disabled={pending} onClick={() => confirm('Reabrir volta a escala para rascunho (dá para editar e gerar de novo). Continuar?') && status('RASCUNHO')}><Unlock /> Reabrir para edição</Button>}
        {!editable && s.status === 'RASCUNHO' && !view.can.edit && <span className="text-xs text-tinta-suave">Só leitura.</span>}
        {s.status !== 'RASCUNHO' && <span className="inline-flex items-center gap-1 text-xs text-tinta-suave"><Lock className="size-3" /> {s.status === 'PUBLICADA' ? 'Publicada' : 'Aprovada'}: ausências novas aparecem nos alertas sem mudar a escala.</span>}
        <div className="flex-1" />
        <Link href={`/escalas-trabalho/${s.id}/imprimir`} target="_blank" className={buttonVariants({ variant: 'secondary', size: 'sm' })}><Printer /> Imprimir / PDF</Link>
        <a href={`/escalas-trabalho/${s.id}/planilha`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}><FileSpreadsheet /> Planilha</a>
        {canWa && <Button size="sm" variant="secondary" disabled={pending} onClick={sendTeam}><MessageCircle /> Enviar para a equipe</Button>}
        <Link href={`/escalas-trabalho?setor=${view.sector.id}&mes=${next}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Próximo mês →</Link>
      </div>
      <FormMessage error={error} success={teamMsg} />

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {[
          ['Escalados', String(a.totals.people)],
          ['Horas previstas', fmtHours(a.totals.minutes)],
          ['Folgas', String(a.totals.offs)],
          ['Abertura coberta', a.totals.opening.total ? `${a.totals.opening.covered}/${a.totals.opening.total}` : '—'],
          ['Fechamento coberto', a.totals.closing.total ? `${a.totals.closing.covered}/${a.totals.closing.total}` : '—'],
          ['Postos descobertos', String(a.totals.uncovered)],
          ['Dias de férias', String(a.totals.vacationDays)],
          ['Ausências (dias)', String(a.totals.absenceDays)],
          ['Coberturas avulsas', String(a.totals.coverageShifts)],
          ['Regras não atendidas', String(a.totals.rulesUnmet)],
          ['Conflitos', String(a.alerts.filter((x) => x.level === 'CONFLITO').length)],
          ['Ajustes', String(a.alerts.filter((x) => x.level === 'AJUSTE').length)],
        ].map(([k, v]) => (
          <Card key={k} className="p-3"><p className="text-[11px] font-semibold text-tinta-suave">{k}</p><p className="text-lg font-extrabold text-navy">{v}</p></Card>
        ))}
      </div>

      {/* Grade */}
      <Card className="p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-borda p-0.5 text-xs font-semibold">
            {(['mes', 'semana'] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} className={cn('rounded-md px-3 py-1', mode === m ? 'bg-navy text-white' : 'text-tinta-suave')}>{m === 'mes' ? 'Mês' : 'Semana'}</button>)}
          </div>
          {mode === 'semana' && (
            <Select value={week} onChange={(e) => setWeek(Number(e.target.value))} className="h-8 w-auto text-xs">
              {weeks.map((w, i) => <option key={i} value={i}>{formatDateBR(w[0]!).slice(0, 5)} a {formatDateBR(w.at(-1)!).slice(0, 5)}</option>)}
            </Select>
          )}
          <span className="text-xs text-tinta-fraca">{editable ? 'Toque num dia para editar ou trocar a folga.' : 'Reabra para editar.'}</span>
          <div className="flex flex-wrap gap-1 text-[10px]">
            {(['FOLGA', 'BANCO', 'FERIAS', 'ATESTADO', 'FALTA', 'FECHADO'] as CellKind[]).map((k) => <span key={k} className={cn('rounded px-1.5 py-0.5 font-semibold', CELL_TONE[k])}>{CELL_LABEL[k]}</span>)}
            <span className="rounded px-1.5 py-0.5 font-semibold ring-2 ring-critico">conflito</span>
            <span className="rounded bg-nacao/10 px-1.5 py-0.5 font-semibold text-nacao">feriado/evento</span>
          </div>
        </div>
        <TopScroll>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-36 border border-borda bg-navy px-2 py-1 text-left text-white">Colaborador</th>
                {days.map((d) => {
                  const p = dayPlan.get(d)!;
                  const mark = p.holiday || p.events.length;
                  return (
                    <th key={d} title={[p.holiday?.name, ...p.events.map((e) => e.name), ...p.notes].filter(Boolean).join(' · ')} className={cn('min-w-[3.4rem] border border-borda px-0.5 py-1 font-bold', !p.open.length ? 'bg-fundo text-tinta-fraca' : mark ? 'bg-nacao/10 text-nacao' : p.weekday >= 6 ? 'bg-navy/5 text-navy' : 'bg-white text-navy')}>
                      <div>{d.slice(8)}</div>
                      <div className="text-[9px] font-semibold">{WEEKDAYS[p.weekday - 1]!.short}{p.holiday ? ' ★' : ''}</div>
                    </th>
                  );
                })}
                <th className="border border-borda bg-navy px-1 text-white">Horas</th>
                <th className="border border-borda bg-navy px-1 text-white">Dias</th>
                <th className="border border-borda bg-navy px-1 text-white">Folgas</th>
                <th className="border border-borda bg-navy px-1 text-white" title="Sábados / domingos trabalhados">S/D</th>
                <th className="border border-borda bg-navy px-1 text-white" title="Banco de horas acumulado: saldo dos meses anteriores + saldo deste mês (horas da escala − referência)">Banco</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const st = stats.get(m.id);
                return (
                  <tr key={m.id}>
                    <td className="sticky left-0 z-10 border border-borda bg-white px-2 py-1">
                      <p className="flex items-center gap-1 font-bold text-navy">
                        <span className="flex-1">{m.name}</span>
                        {canWa && <button type="button" onClick={() => setWaMember(m.id)} title={`Enviar a escala de ${m.name} pelo WhatsApp`} aria-label={`Enviar a escala de ${m.name} pelo WhatsApp`} className={cn('rounded p-0.5 hover:bg-sucesso/10', m.hasPhone ? 'text-sucesso' : 'text-tinta-fraca')}><MessageCircle className="size-3.5" /></button>}
                      </p>
                      <p className="text-[10px] text-tinta-fraca">{[m.functionName, BOND_LABEL[m.bond], m.mode === 'COBERTURA' ? 'cobertura' : null].filter(Boolean).join(' · ')}</p>
                    </td>
                    {days.map((d) => {
                      const c: Cell | undefined = view.grid[m.id]?.[d];
                      const issues = conflictAt.get(`${m.id}|${d}`);
                      const hard = issues?.some((x) => x.level === 'CONFLITO');
                      return (
                        <td key={d} className="border border-borda p-0">
                          <button type="button" disabled={!editable} onClick={() => setEdit({ memberId: m.id, date: d })}
                            title={[c ? CELL_LABEL[c.kind] : '', c?.note, ...(issues ?? []).map((x) => x.message)].filter(Boolean).join('\n')}
                            className={cn('relative block h-9 w-full px-0.5 text-center text-[10px] font-semibold leading-tight', c ? CELL_TONE[c.kind] : 'bg-white', hard && 'ring-2 ring-inset ring-critico', !hard && issues && 'ring-2 ring-inset ring-atencao', editable && 'hover:brightness-95')}>
                            {cellText(c)}
                            {c?.manual && <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-nacao" />}
                            {c?.note?.startsWith('Cobr') && <span className="absolute bottom-0 left-0 right-0 text-[8px] text-nacao">cobre</span>}
                          </button>
                        </td>
                      );
                    })}
                    <td className="border border-borda px-1 text-center font-bold text-navy">{st ? fmtHours(st.minutes) : '—'}</td>
                    <td className="border border-borda px-1 text-center">{st?.days ?? 0}</td>
                    <td className="border border-borda px-1 text-center">{st?.offs ?? 0}</td>
                    <td className="border border-borda px-1 text-center">{st ? `${st.saturdays}/${st.sundays}` : '—'}</td>
                    <td title={st?.totalBankMin == null ? '' : `Anterior ${fmtHours(st.carryMin ?? 0)} + este mês ${fmtHours(st.balanceMin ?? 0)}`} className={cn('border border-borda px-1 text-center font-semibold', (st?.totalBankMin ?? 0) < -60 ? 'text-atencao' : (st?.totalBankMin ?? 0) > 60 ? 'text-nacao' : 'text-tinta-suave')}>{st?.totalBankMin == null ? '—' : fmtHours(st.totalBankMin)}</td>
                  </tr>
                );
              })}
              <tr>
                <td className="sticky left-0 z-10 border border-borda bg-fundo px-2 py-1 text-[10px] font-bold text-navy">Cobertura</td>
                {days.map((d) => {
                  const u = uncoveredAt.get(d);
                  const p = dayPlan.get(d)!;
                  return <td key={d} title={u?.join('\n') ?? (p.open.length ? 'Coberto' : 'Fechado')} className={cn('border border-borda text-center text-[10px] font-bold', u ? 'bg-critico/10 text-critico' : p.open.length ? 'text-sucesso' : 'text-tinta-fraca')}>{u ? `−${u.length}` : p.open.length ? '✓' : ''}</td>;
                })}
                <td colSpan={5} className="border border-borda" />
              </tr>
            </tbody>
          </table>
        </TopScroll>
      </Card>

      {/* Alertas e sugestões */}
      <Card className="p-4">
        <h2 className="mb-2 font-bold text-navy">Alertas e sugestões ({a.alerts.length})</h2>
        {a.alerts.length === 0 ? <p className="text-sm text-sucesso">Nenhum alerta.</p> : (
          <ul className="space-y-2">
            {alerts.map((x, i) => (
              <li key={i} className="text-sm">
                <Badge tone={LEVEL_TONE[x.level]}>{x.level === 'CONFLITO' ? 'Conflito' : x.level === 'AJUSTE' ? 'Ajuste' : 'Info'}</Badge>{' '}
                <span className="text-tinta">{x.message}</span>
                {x.code === 'CALENDARIO' && x.date && view.can.edit && (
                  <button type="button" disabled={pending} onClick={() => start(async () => { const r = await confirmDayAction(view.sector.id, x.date!); if (!r.ok) setError(r.error); else router.refresh(); })}
                    className="ml-2 rounded-md bg-nacao px-2 py-0.5 text-[11px] font-bold text-white hover:opacity-90">Confirmar</button>
                )}
                {x.suggestions?.length ? <p className="ml-1 mt-0.5 text-xs text-tinta-suave">Sugestão: {x.suggestions.join(' · ')}</p> : null}
              </li>
            ))}
          </ul>
        )}
        {a.alerts.length > 12 && <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 text-xs font-semibold text-nacao">{showAll ? 'Mostrar menos' : `Ver todos (${a.alerts.length})`}</button>}
      </Card>

      {waMember && <WhatsSheet view={view} memberId={waMember} testMode={!!wa?.testMode} onClose={() => setWaMember(null)} />}
      {edit && <CellEditor view={view} memberId={edit.memberId} date={edit.date} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); router.refresh(); }} />}
      <p className="text-[11px] text-tinta-fraca">Gerada em {s.generatedAt ? new Date(s.generatedAt).toLocaleString('pt-BR') : '—'}{s.publishedAt ? ` · publicada em ${new Date(s.publishedAt).toLocaleString('pt-BR')}` : ''}. Mês: {mes}.</p>
    </div>
  );
}

function CellEditor({ view, memberId, date, onClose, onSaved }: { view: MonthView; memberId: string; date: IsoDate; onClose: () => void; onSaved: () => void }) {
  const m = view.members.find((x) => x.id === memberId)!;
  const cur = view.grid[memberId]?.[date] ?? { kind: 'FOLGA' as CellKind };
  const base = m.hours.base ?? [420, 900, 60];
  const [v, setV] = useState({ kind: cur.kind, start: formatClock(cur.startMin ?? base[0]), end: formatClock(Math.min(cur.endMin ?? base[1], 1439)), brk: cur.breakMin ?? base[2], note: cur.note ?? '' });
  const [swap, setSwap] = useState<{ memberId: string; date: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const p = view.days.find((d) => d.date === date)!;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = swap
        ? await swapCellsAction(view.schedule!.id, { memberId, date }, swap)
        : await editCellAction(view.schedule!.id, memberId, date, { kind: v.kind, startMin: parseClock(v.start), endMin: parseClock(v.end), breakMin: v.brk, note: v.note });
      if (!r.ok) setError(r.error); else onSaved();
    });
  };
  const options = view.month.days.filter((d) => d !== date);
  return (
    <Sheet title={`${m.name} — ${formatDateBR(date)} (${WEEKDAYS[p.weekday - 1]!.long})`} onClose={onClose} onSubmit={save}
      footer={<><Button type="submit" disabled={pending}>{pending ? 'Salvando…' : swap ? 'Trocar' : 'Salvar'}</Button><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button></>}>
      <p className="text-xs text-tinta-suave">Funcionamento: {p.open.length ? p.open.map(([a, b]) => `${formatClock(a)}–${formatClock(b)}`).join(', ') : 'fechado'}{p.holiday ? ` · ${p.holiday.name}` : ''}{p.events.length ? ` · ${p.events.map((e) => e.name).join(', ')}` : ''}</p>
      {!swap && (
        <>
          <div>
            <Label htmlFor="c-kind">Situação</Label>
            <Select id="c-kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as CellKind })}>
              {KINDS.map((k) => <option key={k} value={k}>{CELL_LABEL[k]}</option>)}
            </Select>
            {['FERIAS', 'ATESTADO', 'FALTA', 'AFASTAMENTO'].includes(v.kind) && <p className="mt-1 text-xs text-tinta-suave">Para valer também nas horas, registre em Férias e ausências.</p>}
            {v.kind === 'BANCO' && <p className="mt-1 text-xs text-tinta-suave">Folga compensada com o banco de horas: não conta como falta nem descumpre as regras do setor; as horas do dia saem do saldo previsto.</p>}
            {v.kind === 'TRABALHO' && cur.kind !== 'TRABALHO' && <p className="mt-1 text-xs text-tinta-suave">Trabalho num dia de folga entra como crédito no banco de horas previsto.</p>}
          </div>
          {v.kind === 'TRABALHO' && (
            <div className="grid grid-cols-3 gap-2">
              <div><Label htmlFor="c-s">Entrada</Label><Input id="c-s" type="time" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} /></div>
              <div><Label htmlFor="c-e">Saída</Label><Input id="c-e" type="time" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} /></div>
              <div><Label htmlFor="c-b">Intervalo (min)</Label><Input id="c-b" type="number" min={0} max={240} step={5} value={v.brk} onChange={(e) => setV({ ...v, brk: Number(e.target.value) || 0 })} /></div>
            </div>
          )}
          <div><Label htmlFor="c-n">Observação</Label><Input id="c-n" maxLength={120} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="Ex.: cobre a abertura" /></div>
        </>
      )}
      <div className="rounded-lg bg-fundo p-3">
        <p className="mb-2 flex items-center gap-1 text-xs font-bold text-navy"><ArrowLeftRight className="size-3.5" /> Trocar folga/turno</p>
        <div className="grid grid-cols-2 gap-2">
          <Select aria-label="Com quem" value={swap?.memberId ?? ''} onChange={(e) => setSwap(e.target.value ? { memberId: e.target.value, date: swap?.date ?? date } : null)} className="text-xs">
            <option value="">— não trocar —</option>
            {view.members.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.id === memberId ? `${x.name} (outro dia)` : x.name}</option>)}
          </Select>
          {swap && (
            <Select aria-label="Dia" value={swap.date} onChange={(e) => setSwap({ ...swap, date: e.target.value })} className="text-xs">
              {(swap.memberId === memberId ? options : view.month.days).map((d) => <option key={d} value={d}>{formatDateBR(d).slice(0, 5)} · {cellText(view.grid[swap.memberId]?.[d]) || '—'}</option>)}
            </Select>
          )}
        </div>
        <p className="mt-1 text-[11px] text-tinta-suave">A troca inverte os dois dias e a verificação de cobertura e jornada roda de novo.</p>
      </div>
      <FormMessage error={error} />
    </Sheet>
  );
}

/** Prévia da mensagem com a escala do mês da pessoa (editável) e envio pela Z-API. */
function WhatsSheet({ view, memberId, testMode, onClose }: { view: MonthView; memberId: string; testMode: boolean; onClose: () => void }) {
  const m = view.members.find((x) => x.id === memberId)!;
  const st = view.analysis?.members.find((x) => x.memberId === memberId);
  const monthDays = view.days.filter((d) => d.date >= view.month.first && d.date <= view.month.last);
  const [text, setText] = useState(() => memberScheduleText({
    sector: view.sector.name, monthLabel: view.month.label, status: view.schedule!.status, name: m.name, days: monthDays,
    cells: Object.fromEntries(monthDays.map((d) => [d.date, view.grid[m.id]?.[d.date]])), minutes: st?.minutes ?? 0, workDays: st?.days ?? 0, offs: st?.offs ?? 0,
  }));
  const [to, setTo] = useState('');
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <Sheet title={`Escala de ${m.name} pelo WhatsApp`} onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); start(async () => {
        const r = await sendMemberScheduleAction(view.schedule!.id, memberId, { to, text });
        if (!r.ok) return setMsg({ error: r.error });
        setMsg({ ok: r.data.status === 'SIMULATED' ? `Simulado para ${r.data.to}.` : r.data.testMode ? `Enviado ao número de TESTE (destino real: ${r.data.to}).` : `Enviado para ${r.data.to}. ✅` });
      }); }}
      footer={<><Button type="submit" disabled={pending}><MessageCircle /> {pending ? 'Enviando…' : 'Enviar pelo WhatsApp'}</Button><Button type="button" variant="ghost" onClick={onClose}>Fechar</Button></>}>
      {testMode && <p className="rounded-lg bg-atencao/10 px-3 py-2 text-xs text-atencao">Modo teste: a mensagem vai para o número de teste.</p>}
      {view.schedule!.status === 'RASCUNHO' && <p className="rounded-lg bg-atencao/10 px-3 py-2 text-xs text-atencao">A escala ainda é rascunho: a mensagem avisa que é uma prévia.</p>}
      <div>
        <Label htmlFor="wa-to">Para</Label>
        <Input id="wa-to" value={to} onChange={(e) => setTo(e.target.value)} inputMode="tel" placeholder={m.hasPhone ? 'Vazio = número do cadastro' : 'Sem telefone no cadastro: informe DDD + número'} />
      </div>
      <div>
        <Label htmlFor="wa-text">Mensagem</Label>
        <textarea id="wa-text" className="min-h-72 w-full rounded-lg border border-borda p-2 font-mono text-xs" value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} />
        <p className="text-right text-[11px] text-tinta-fraca">*negrito* funciona no WhatsApp · {text.length}/4000</p>
      </div>
      <FormMessage error={msg?.error} success={msg?.ok} />
    </Sheet>
  );
}
