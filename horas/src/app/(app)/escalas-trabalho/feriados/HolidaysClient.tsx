'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { formatDateBR, weekdayOf, WEEKDAYS } from '@/domain/dates';
import { HOLIDAY_MODE_LABEL, HOLIDAY_MODES, windowsLabel, type HolidayMode } from '@/domain/escalas/calendar';
import type { Window } from '@/domain/escalas/types';
import { cn } from '@/lib/cn';
import type { holidayBoard } from '@/server/services/ws-service';
import { confirmDayAction, deleteOverrideAction, saveHolidayRuleAction, saveOverrideAction } from '../actions';
import { WindowInput } from '../shared';

type Board = Awaited<ReturnType<typeof holidayBoard>>;
type SectorRule = Board['sectors'][number];
type Holiday = Board['holidays'][number];
type Result = { ok: boolean; error?: string };

const day = (d: string) => `${formatDateBR(d).slice(0, 5)} ${WEEKDAYS[weekdayOf(d) - 1]!.short.toLowerCase()}`;
const hoursLabel = (w: Window[] | null) => (w === null ? 'sem horário' : w.length ? windowsLabel(w) : 'fechado');

export function HolidaysClient({ board }: { board: Board }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adjust, setAdjust] = useState<Holiday | null>(null);
  const run = (fn: () => Promise<Result>, after?: () => void) => start(async () => {
    const r = await fn();
    if (!r.ok) setError(r.error ?? 'Erro.'); else { setError(null); after?.(); router.refresh(); }
  });
  const sectorName = new Map(board.sectors.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-4">
      <FormMessage error={error} />
      <Card className="p-4">
        <h2 className="font-bold text-navy">1. Regra de cada setor no feriado</h2>
        <p className="mb-3 text-xs text-tinta-suave">
          <b>Como sábado</b> usa o horário, a equipe e os postos de sábado do setor (Pré-requisitos) — mudou o sábado, o feriado acompanha.
          Use <b>Horário próprio</b> só para quem é diferente (ex.: Recepção 07h–14h). <b>Pessoas no feriado</b> limita a equipe; com o <b>rodízio</b>, vai quem trabalhou menos feriados.
          FUNAP trabalha o feriado no horário de sempre.
        </p>
        <div className="space-y-2">
          {board.sectors.map((s) => <RuleRow key={s.id} s={s} canEdit={board.canEdit} pending={pending} onSave={(input) => run(() => saveHolidayRuleAction(s.id, input))} />)}
          {!board.sectors.length && <p className="text-sm text-tinta-suave">Nenhum setor de escala que você lidere.</p>}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-bold text-navy">2. Próximos feriados — confirme ou ajuste antes de gerar a escala</h2>
        <p className="mb-3 text-xs text-tinta-suave">
          Cada setor mostra o horário que vai para a escala. <Badge tone="amber">A confirmar</Badge> some quando você confirma; <b>Ajustar horário</b> muda só aquele feriado (ex.: 15/11 a Nação fecha às 14h).
          Depois de confirmar ou ajustar, gere a escala do mês de novo (rascunho).
        </p>
        <ul className="divide-y divide-borda">
          {board.holidays.map((h) => {
            const facultativo = h.scope === 'FACULTATIVO';
            const pendingSectors = h.sectors.filter((x) => x.needsConfirm);
            return (
              <li key={h.date} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="w-24 text-navy">{day(h.date)}</b>
                  <span className="font-semibold">{h.name}</span>
                  <span className="text-xs text-tinta-fraca">({h.scope.toLowerCase()})</span>
                  <div className="ml-auto flex gap-2">
                    {board.canEdit && pendingSectors.length > 1 && (
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(async () => {
                        for (const x of pendingSectors) { const r = await confirmDayAction(x.sectorId, h.date); if (!r.ok) return r; }
                        return { ok: true };
                      })}><Check /> Confirmar todos</Button>
                    )}
                    {board.canEdit && !facultativo && <Button size="sm" variant="secondary" onClick={() => setAdjust(h)}><Clock /> Ajustar horário</Button>}
                  </div>
                </div>
                {facultativo ? (
                  <p className="mt-1 text-xs text-tinta-suave">Ponto facultativo: os setores funcionam no horário normal do dia.</p>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {h.sectors.map((x) => (
                      <div key={x.sectorId} className={cn('rounded-lg border p-2 text-sm', x.needsConfirm ? 'border-atencao/50 bg-atencao/5' : 'border-borda')}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-navy">{sectorName.get(x.sectorId)}</span>
                          {x.confirmed ? <Badge tone="green"><Check className="size-3" /> confirmado</Badge> : x.needsConfirm ? <Badge tone="amber">a confirmar</Badge> : null}
                        </div>
                        <p className="text-tinta">{x.open.length ? windowsLabel(x.open) : 'Fechado'}{x.adjusted && <span className="ml-1 text-xs font-semibold text-nacao">(ajustado)</span>}</p>
                        {board.canEdit && (
                          <div className="mt-1 flex gap-3 text-xs font-semibold">
                            {x.needsConfirm && <button type="button" disabled={pending} onClick={() => run(() => confirmDayAction(x.sectorId, h.date))} className="text-nacao">Confirmar</button>}
                            {x.confirmationId && <button type="button" disabled={pending} onClick={() => run(() => deleteOverrideAction(x.confirmationId!))} className="text-tinta-fraca hover:text-critico">Desfazer confirmação</button>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {h.adjustments.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {h.adjustments.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-2">
                        <Badge tone={a.closed ? 'red' : 'cyan'}>{a.closed ? 'Fechado' : 'Horário ajustado'}</Badge>
                        <span>{a.sector ?? 'Nação inteira'}{a.hours?.length ? ` · ${windowsLabel(a.hours)}` : ''} · {a.reason}</span>
                        {board.canEdit && (board.canAdmin || a.sectorId) && (
                          <button type="button" disabled={pending} onClick={() => confirm('Voltar ao horário padrão deste feriado?') && run(() => deleteOverrideAction(a.id))} className="inline-flex items-center gap-1 font-semibold text-tinta-fraca hover:text-critico"><RotateCcw className="size-3" /> voltar ao padrão</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          {!board.holidays.length && <li className="py-3 text-sm text-tinta-suave">Nenhum feriado cadastrado para os próximos 12 meses (Administração → Cadastros → Feriados).</li>}
        </ul>
      </Card>

      {adjust && <AdjustSheet h={adjust} board={board} pending={pending} error={error} onClose={() => setAdjust(null)} onSave={(input) => run(() => saveOverrideAction(null, input), () => setAdjust(null))} />}
    </div>
  );
}

function RuleRow({ s, canEdit, pending, onSave }: { s: SectorRule; canEdit: boolean; pending: boolean; onSave: (input: unknown) => void }) {
  const [mode, setMode] = useState<HolidayMode>(s.mode);
  const [own, setOwn] = useState<Window>(s.own?.[0] ?? [420, 840]);
  const [staff, setStaff] = useState(s.staff ? String(s.staff) : '');
  const [rotate, setRotate] = useState(s.rotate);
  const [conf, setConf] = useState(s.confirm);
  const dirty = mode !== s.mode || (mode === 'PROPRIO' && JSON.stringify([own]) !== JSON.stringify(s.own)) || staff !== (s.staff ? String(s.staff) : '') || rotate !== s.rotate || conf !== s.confirm;
  const derived = mode === 'SABADO' ? `${hoursLabel(s.saturday)} (horário de sábado)` : mode === 'DOMINGO' ? `${hoursLabel(s.sunday)} (horário de domingo)` : mode === 'FECHADO' ? 'Fechado em todo feriado' : null;
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-fundo p-3">
      <span className="w-full font-bold text-navy sm:w-40 sm:self-center">{s.name}</span>
      <div>
        <Label htmlFor={`m-${s.id}`}>No feriado funciona</Label>
        <Select id={`m-${s.id}`} value={mode} disabled={!canEdit} onChange={(e) => setMode(e.target.value as HolidayMode)} className="w-44">
          {HOLIDAY_MODES.map((m) => <option key={m} value={m}>{HOLIDAY_MODE_LABEL[m]}</option>)}
        </Select>
      </div>
      <div className="min-w-[14rem]">
        <Label>Horário</Label>
        {mode === 'PROPRIO' ? <WindowInput value={own} onChange={setOwn} /> : <p className="py-2 text-sm text-tinta">{derived}</p>}
      </div>
      {mode !== 'FECHADO' && (
        <>
          <div>
            <Label htmlFor={`p-${s.id}`}>Pessoas no feriado</Label>
            <Input id={`p-${s.id}`} type="number" min={1} max={50} value={staff} disabled={!canEdit} onChange={(e) => setStaff(e.target.value)} placeholder={mode === 'DOMINGO' ? 'equipe de domingo' : 'equipe de sábado'} className="w-40" />
          </div>
          <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={rotate} disabled={!canEdit} onChange={(e) => setRotate(e.target.checked)} className="size-4 accent-[#0169E9]" /> Rodízio</label>
        </>
      )}
      <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={conf} disabled={!canEdit} onChange={(e) => setConf(e.target.checked)} className="size-4 accent-[#0169E9]" /> Confirmar cada feriado</label>
      {canEdit && (
        <Button size="sm" className="mb-1 ml-auto" disabled={pending || !dirty} onClick={() => onSave({ mode, hours: mode === 'PROPRIO' ? [own] : null, staff: mode !== 'FECHADO' && staff ? Number(staff) : null, rotate: mode !== 'FECHADO' && rotate, confirm: conf })}>
          {dirty ? 'Salvar' : 'Salvo'}
        </Button>
      )}
    </div>
  );
}

function AdjustSheet({ h, board, pending, error, onClose, onSave }: { h: Holiday; board: Board; pending: boolean; error: string | null; onClose: () => void; onSave: (input: unknown) => void }) {
  const [sectorId, setSectorId] = useState(board.canAdmin ? '' : board.sectors[0]?.id ?? '');
  const [closed, setClosed] = useState(false);
  const [win, setWin] = useState<Window>([480, 840]);
  const [reason, setReason] = useState(`${h.name}: horário reduzido`);
  return (
    <Sheet title={`Ajustar ${formatDateBR(h.date).slice(0, 5)} — ${h.name}`} onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); onSave({ date: h.date, sectorId: sectorId || null, closed, hours: closed ? null : [win], reason, eventId: null, extraPeople: 0 }); }}
      footer={<><Button type="submit" disabled={pending}>Salvar ajuste</Button><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button></>}>
      <div>
        <Label htmlFor="a-s">Vale para</Label>
        <Select id="a-s" value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
          {board.canAdmin && <option value="">Nação inteira</option>}
          {board.sectors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} className="size-4 accent-[#0169E9]" /> Fechado neste feriado</label>
      {!closed && <div><Label>Funciona das</Label><WindowInput value={win} onChange={setWin} /></div>}
      <div><Label htmlFor="a-r">Motivo</Label><Input id="a-r" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} /></div>
      <div className="rounded-lg bg-fundo p-3 text-xs text-tinta-suave">
        Hoje, neste feriado: {h.sectors.map((x) => `${board.sectors.find((s) => s.id === x.sectorId)?.name} ${x.open.length ? windowsLabel(x.open) : 'fechado'}`).join(' · ')}.
        {!sectorId && ' Com a Nação inteira, cada setor fica dentro do novo horário (ex.: sábado 07–17 com a Nação 08–14 → 08–14).'}
      </div>
      <FormMessage error={error} />
    </Sheet>
  );
}
