import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, PageHeader } from '@/components/ui/card';
import { formatDateBR, weekdayOf, WEEKDAYS } from '@/domain/dates';
import { windowsLabel } from '@/domain/escalas/calendar';
import { BOND_LABEL, SOURCE_LABEL, fmtHours, hhmm } from '@/domain/escalas/labels';
import { LEAVE_LABEL, type LeaveType } from '@/domain/leave';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listSectors, loadMonth } from '@/server/services/ws-service';
import { resolveParams } from './params';
import { GenerateButton, ScheduleClient } from './ScheduleClient';
import { SectorMonthPicker } from './shared';

export const metadata: Metadata = { title: 'Escalas de Trabalho 5x2' };

export default async function EscalasTrabalhoPage({ searchParams }: { searchParams: Promise<{ setor?: string; mes?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'ws.view')) redirect('/hoje');
  const sectors = (await listSectors(principal)).filter((s) => s.active);
  const q = resolveParams(await searchParams, sectors);
  const header = (
    <PageHeader title="Escalas de Trabalho 5x2" description="Escolha o setor e o mês, confira calendário, funcionamento, equipe e pré-requisitos e clique em GERAR ESCALA. O sistema monta a grade mensal, distribui as folgas e aponta o que ficou descoberto — sem inventar ninguém." />
  );
  if (!q.sectorId) {
    return (
      <>
        {header}
        <Card className="p-6 text-sm text-tinta-suave">
          {can(principal, 'ws.admin')
            ? <>Nenhum setor de escala ainda. <Link href="/escalas-trabalho/pre-requisitos" className="font-semibold text-nacao underline">Crie o primeiro setor</Link>.</>
            : 'Você ainda não lidera nenhum setor com escala. Peça à gestão para ligar o seu setor (Gestão de Processos) a uma escala.'}
        </Card>
      </>
    );
  }
  const v = await loadMonth(principal, q.sectorId, q.year, q.month);
  const m = v.month;
  const holidays = v.days.filter((d) => d.date >= m.first && d.date <= m.last && d.holiday);
  const special = v.days.filter((d) => d.date >= m.first && d.date <= m.last && (d.source === 'SETOR_EXCECAO' || d.source === 'NACAO_EXCECAO' || d.events.length || d.confirm.length));
  const byWeekday = WEEKDAYS.map((w) => {
    const d = v.days.find((x) => x.weekday === w.n && x.date >= m.first && !x.holiday && x.source !== 'SETOR_EXCECAO' && x.source !== 'NACAO_EXCECAO');
    return { w, text: d ? windowsLabel(d.open) : '—', source: d ? SOURCE_LABEL[d.source] : '' };
  });
  const absences = v.absences.filter((x) => x.start <= m.last && x.end >= m.first);
  const nameOf = new Map(v.members.map((x) => [x.id, x.name]));
  const active = v.members.filter((x) => x.active);
  const pend = active.filter((x) => x.mode === 'FIXO' && x.autoSchedule && !x.hours.base && !x.hours.week);
  const legalBonds = [...new Set(active.map((x) => x.bond))].filter((b) => b === 'CLT' || b === 'FUNAP');

  return (
    <>
      {header}
      <Card className="mb-4 flex flex-wrap items-end justify-between gap-3 p-4">
        <SectorMonthPicker sectors={sectors} sectorId={q.sectorId} month={q.mes} />
        {v.can.edit && (!v.schedule || v.schedule.status === 'RASCUNHO') && <GenerateButton sectorId={q.sectorId} year={q.year} month={q.month} exists={!!v.schedule} />}
      </Card>

      {/* Os quatro elementos cruzados antes de gerar. */}
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-1 font-bold text-navy">1. Calendário real — {m.label}</h2>
          <p className="text-sm text-tinta-suave">{m.length} dias · começa {WEEKDAYS[weekdayOf(m.first) - 1]!.long.toLowerCase()} ({formatDateBR(m.first)}) e termina {WEEKDAYS[weekdayOf(m.last) - 1]!.long.toLowerCase()} ({formatDateBR(m.last)}).</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {WEEKDAYS.map((w) => <Badge key={w.n} tone="neutral">{m.weekdayCount[w.n]} {w.short.toLowerCase()}</Badge>)}
          </div>
          <p className="mt-2 text-xs text-tinta-suave">Semanas de segunda a domingo: {m.weeks.length} (a 1ª começa em {formatDateBR(m.rangeStart)}, a última termina em {formatDateBR(m.rangeEnd)} — horas e descansos contam a semana inteira).</p>
          {holidays.length > 0 && <ul className="mt-2 space-y-0.5 text-sm">{holidays.map((d) => <li key={d.date}><b className="text-navy">{formatDateBR(d.date).slice(0, 5)}</b> {d.holiday!.name} <span className="text-xs text-tinta-fraca">({d.holiday!.scope.toLowerCase()})</span></li>)}</ul>}
        </Card>

        <Card className="p-4">
          <div className="mb-1 flex items-center justify-between"><h2 className="font-bold text-navy">2. Funcionamento do setor</h2><Link href={`/escalas-trabalho/funcionamento?setor=${q.sectorId}&mes=${q.mes}`} className="text-xs font-semibold text-nacao">Ajustar</Link></div>
          <ul className="grid grid-cols-2 gap-x-3 text-sm sm:grid-cols-4">
            {byWeekday.map(({ w, text, source }) => <li key={w.n} title={source}><b className="text-navy">{w.short}</b> {text}</li>)}
          </ul>
          {special.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {special.map((d) => (
                <li key={d.date}><b className="text-navy">{formatDateBR(d.date).slice(0, 5)}</b> {windowsLabel(d.open)} — {[...d.notes, ...d.events.map((e) => `${e.name}${e.extraPeople ? ` (+${e.extraPeople} pessoa(s))` : ''}`)].join(' · ')}{d.confirm.length > 0 && <span className="text-atencao"> · confirmar: {d.confirm.join(' ')}</span>}</li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-1 flex items-center justify-between"><h2 className="font-bold text-navy">3. Pessoas disponíveis ({active.length})</h2><Link href={`/escalas-trabalho/equipes?setor=${q.sectorId}&mes=${q.mes}`} className="text-xs font-semibold text-nacao">Equipe</Link></div>
          {active.length === 0 ? <p className="text-sm text-tinta-suave">Nenhum colaborador na equipe.</p> : (
            <ul className="space-y-0.5 text-sm">
              {active.map((x) => (
                <li key={x.id} className="flex flex-wrap items-baseline gap-x-2">
                  <b className="text-navy">{x.name}</b>
                  <span className="text-xs text-tinta-suave">{[x.functionName, BOND_LABEL[x.bond], x.mode === 'COBERTURA' ? 'cobertura' : null, !x.autoSchedule ? 'fora da geração' : null].filter(Boolean).join(' · ')}</span>
                  <span className="text-xs text-tinta-fraca">{x.hours.week ? `grade semanal${x.hours.week.B ? ' A/B' : ''}` : x.hours.base ? `${hhmm(x.hours.base[0])}–${hhmm(x.hours.base[1])}` : x.mode === 'COBERTURA' ? 'sob demanda' : 'sem horário'}{x.fixedOff.length ? ` · folga ${x.fixedOff.map((n) => WEEKDAYS[n - 1]!.short.toLowerCase()).join('/')}` : ''}{x.availableDays.length ? ` · disponível ${x.availableDays.map((n) => WEEKDAYS[n - 1]!.short.toLowerCase()).join('/')}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
          {pend.length > 0 && <p className="mt-2 text-xs text-atencao">Sem horário habitual (ficam fora): {pend.map((x) => x.name).join(', ')}.</p>}
          {absences.length > 0 && <p className="mt-2 text-xs text-tinta-suave">Ausências no mês: {absences.map((x) => `${nameOf.get(x.memberId)} (${(LEAVE_LABEL[x.type as LeaveType] ?? x.type).toLowerCase()} ${formatDateBR(x.start).slice(0, 5)}${x.end !== x.start ? `–${formatDateBR(x.end).slice(0, 5)}` : ''})`).join(' · ')}</p>}
        </Card>

        <Card className="p-4">
          <div className="mb-1 flex items-center justify-between"><h2 className="font-bold text-navy">4. Pré-requisitos ativos ({v.rules.length + v.posts.length})</h2><Link href={`/escalas-trabalho/pre-requisitos?setor=${q.sectorId}&mes=${q.mes}`} className="text-xs font-semibold text-nacao">Editar</Link></div>
          <ul className="space-y-0.5 text-sm">
            {v.posts.map((p) => <li key={p.id}><Badge tone={p.mandatory ? 'navy' : 'neutral'}>{p.mandatory ? 'Obrigatória' : 'Preferencial'}</Badge> {p.name} {hhmm(p.startMin)}–{hhmm(p.endMin)} · mín. {p.minPeople}{p.functionName ? ` (${p.functionName})` : ''}</li>)}
            {v.rules.map((r) => <li key={r.id}><Badge tone={r.mandatory ? 'navy' : 'neutral'}>{r.mandatory ? 'Obrigatória' : 'Preferencial'}</Badge> {r.label}</li>)}
          </ul>
          {v.posts.length + v.rules.length === 0 && <p className="text-sm text-tinta-suave">Nenhum. Sem postos cadastrados, a escala não verifica cobertura.</p>}
          <p className="mt-2 text-xs text-tinta-suave">
            Parâmetros legais: {legalBonds.length === 0 ? '—' : legalBonds.map((b) => v.legal[b] ? `${b} ${v.legal[b]!.validated ? 'validados pelo DP' : 'NÃO validados'} (vigência ${formatDateBR(v.legal[b]!.validFrom)})` : `${b} não cadastrados`).join(' · ')}
            {' · '}Ciclo A/B: semana A começa em {formatDateBR(v.sector.cycleRef)}.
          </p>
        </Card>
      </div>

      {v.schedule ? <ScheduleClient view={v} /> : (
        <Card className="p-6 text-center text-sm text-tinta-suave">Ainda não há escala para {m.label}. {v.can.edit ? 'Confira os quatro blocos acima e clique em GERAR ESCALA.' : ''}</Card>
      )}
      <p className="mt-4 text-[11px] text-tinta-fraca">Carga semanal de referência e banco de horas previstos: {fmtHours(2400)}/semana por padrão (ajustável por colaborador). Os cálculos de datas, horas e descansos são do sistema (determinísticos), não de IA.</p>
    </>
  );
}
