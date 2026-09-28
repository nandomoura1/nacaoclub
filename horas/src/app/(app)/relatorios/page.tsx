import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Download, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Logo } from '@/components/Logo';
import { formatDateBR } from '@/domain/dates';
import { periodKey, periodLabel, periodOf, shiftPeriod } from '@/domain/period';
import type { ReportRow } from '@/domain/report';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMinutes } from '@/lib/format';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { periodStartDay } from '@/server/services/period-service';
import { filterToParams, hoursReport, parseReportFilter } from '@/server/services/report-service';
import { PrintButton } from '@/components/PrintButton';

export const metadata: Metadata = { title: 'Relatórios' };

const VIEWS = [
  { key: 'professor', label: 'Por professor' },
  { key: 'modalidade', label: 'Por modalidade' },
  { key: 'cruzado', label: 'Professor × modalidade' },
  { key: 'aulas', label: 'Aula a aula' },
] as const;
type View = (typeof VIEWS)[number]['key'];

const STATUS: Record<string, string> = {
  PREVISTA: 'dada', REALIZADA: 'dada', SUBSTITUIDA: 'substituída', CANCELADA: 'cancelada',
  AUSENTE_PENDENTE: 'falta', AGUARDANDO_DECISAO_FERIADO: 'feriado: aguardando',
};

const COLS: { key: keyof ReportRow; label: string; title: string }[] = [
  { key: 'plannedMin', label: 'Previstas', title: 'Horas na grade do período' },
  { key: 'ownMin', label: 'Dadas', title: 'Aulas próprias dadas (ou canceladas com pagamento)' },
  { key: 'substitutionMin', label: 'Substituições', title: 'Aulas de outros que a pessoa cobriu' },
  { key: 'extraMin', label: 'Extras', title: 'Aulas avulsas fora da grade' },
  { key: 'absenceMin', label: 'Ausências', title: 'Faltas, férias, atestados (não entram no total)' },
  { key: 'cancelledMin', label: 'Canceladas', title: 'Aulas canceladas sem pagamento' },
  { key: 'pendingMin', label: 'Aguardando', title: 'Feriado ainda sem decisão' },
  { key: 'totalMin', label: 'Total', title: 'Dadas + substituições + extras' },
];

function HoursCells({ row }: { row: ReportRow }) {
  return (
    <>
      {COLS.map((c) => (
        <td key={c.key} className={cn('tabular whitespace-nowrap px-2 py-1.5 text-right', c.key === 'totalMin' && 'font-bold text-navy', (row[c.key] as number) === 0 && 'text-tinta-fraca')}>
          {formatMinutes(row[c.key] as number)}
        </td>
      ))}
    </>
  );
}

const th = 'px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-tinta-suave';

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'payroll.view_hours')) redirect('/hoje');
  const sp = await searchParams;
  const filter = await parseReportFilter(sp);
  const view: View = VIEWS.some((v) => v.key === sp.visao) ? (sp.visao as View) : 'professor';
  const r = await hoursReport(principal, filter);
  const qs = filterToParams(filter);

  const startDay = await periodStartDay();
  const current = periodOf(todayIso(), startDay);
  const periods = Array.from({ length: 15 }, (_, i) => shiftPeriod(current, 2 - i));
  const areaScope = principal.areaIds === null ? {} : { id: { in: [...principal.areaIds] } };
  const [areas, modalities, teachers] = await Promise.all([
    prisma.coordinationArea.findMany({ where: { deletedAt: null, active: true, ...areaScope }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.modality.findMany({ where: { active: true, ...(principal.areaIds === null ? {} : { areaId: { in: [...principal.areaIds] } }) }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.teacher.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const filters = [r.labels.area && `Área: ${r.labels.area}`, r.labels.modality && `Modalidade: ${r.labels.modality}`, r.labels.teacher && `Professor: ${r.labels.teacher}`, r.labels.scope].filter(Boolean);

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Relatórios de horas</h1>
          <p className="mt-1 text-sm text-tinta-suave">Horas por período, com os mesmos números do fechamento. Imprima ou baixe em Excel para a contabilidade.</p>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <a href={`/relatorios/exportar?${qs}`} download className={buttonVariants()}><Download /> Baixar Excel</a>
        </div>
      </div>

      {/* Filtros: formulário GET — a URL guarda o relatório (dá para salvar e compartilhar). */}
      <Card className="mb-4 p-4 print:hidden">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <input type="hidden" name="visao" value={view} />
          <div>
            <Label htmlFor="modo">Período</Label>
            <Select id="modo" name="modo" defaultValue={filter.mode}>
              <option value="competencia">Competência (26→25)</option>
              <option value="intervalo">Datas livres</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="competencia">Competência</Label>
            <Select id="competencia" name="competencia" defaultValue={periodKey(filter.period)}>
              {periods.map((p) => <option key={periodKey(p)} value={periodKey(p)}>{periodLabel(p)}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2">
            <div><Label htmlFor="de">De</Label><Input id="de" name="de" type="date" defaultValue={filter.start} /></div>
            <div><Label htmlFor="ate">Até</Label><Input id="ate" name="ate" type="date" defaultValue={filter.end} /></div>
          </div>
          <div>
            <Label htmlFor="area">Área</Label>
            <Select id="area" name="area" defaultValue={filter.areaId ?? ''}>
              {principal.areaIds === null && <option value="">Todas</option>}
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="modalidade">Modalidade</Label>
            <Select id="modalidade" name="modalidade" defaultValue={filter.modalityId ?? ''}>
              <option value="">Todas</option>
              {modalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="professor">Professor</Label>
            <Select id="professor" name="professor" defaultValue={filter.teacherId ?? ''}>
              <option value="">Todos</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <p className="text-xs text-tinta-fraca lg:col-span-3">Em “Datas livres” valem De/Até (até 400 dias). Em “Competência”, as datas vêm do mês escolhido.</p>
          <button type="submit" className={buttonVariants()}>Gerar relatório</button>
        </form>
      </Card>

      {/* Cabeçalho que só aparece no papel. */}
      <div className="mb-4 hidden items-start justify-between border-b-2 border-navy pb-3 print:flex">
        <div className="text-navy"><Logo /></div>
        <div className="text-right text-xs text-tinta-suave">Emitido em {formatDateTime(new Date())}<br />por {principal.name}</div>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-extrabold text-navy">{VIEWS.find((v) => v.key === view)!.label} · {r.labels.period}</h2>
        {filters.length > 0 && <p className="text-sm text-tinta-suave">{filters.join(' · ')}</p>}
      </div>

      {r.missing.length > 0 && (
        <Card className="mb-4 flex items-start gap-2 border-atencao/40 p-3 text-sm text-atencao print:border-0 print:p-0">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>Sem aulas geradas para: <b>{r.missing.join(', ')}</b>. Gere a competência no Calendário para que essas datas entrem no relatório.</span>
        </Card>
      )}

      <nav className="mb-3 flex flex-wrap gap-1.5 print:hidden">
        {VIEWS.map((v) => (
          <Link key={v.key} href={`/relatorios?${qs}&visao=${v.key}`}
            className={cn('rounded-full px-3 py-1 text-xs font-semibold', v.key === view ? 'bg-navy text-white' : 'ring-1 ring-borda text-tinta-suave')}>
            {v.label}
          </Link>
        ))}
      </nav>

      <Card className="overflow-x-auto print:overflow-visible print:border-0 print:shadow-none">
        {view === 'professor' && (
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo"><tr><th className={th}>Professor</th><th className={th}>Modalidades</th>{COLS.map((c) => <th key={c.key} className={cn(th, 'text-right')} title={c.title}>{c.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-borda">
              {r.byTeacher.map((t) => (
                <tr key={t.teacherId}>
                  <td className="px-2 py-1.5 font-semibold text-tinta">{t.teacher}</td>
                  <td className="px-2 py-1.5 text-xs text-tinta-suave">{t.modalities.join(', ')}</td>
                  <HoursCells row={t} />
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-navy"><tr><td className="px-2 py-2 font-bold" colSpan={2}>Total · {r.byTeacher.length} pessoa(s)</td><HoursCells row={r.totals} /></tr></tfoot>
          </table>
        )}
        {view === 'modalidade' && (
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo"><tr><th className={th}>Área</th><th className={th}>Modalidade</th><th className={cn(th, 'text-right')}>Pessoas</th>{COLS.map((c) => <th key={c.key} className={cn(th, 'text-right')} title={c.title}>{c.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-borda">
              {r.byModality.map((m) => (
                <tr key={m.modalityId}>
                  <td className="px-2 py-1.5 text-xs text-tinta-suave">{m.area}</td>
                  <td className="px-2 py-1.5 font-semibold text-tinta">{m.modality}</td>
                  <td className="tabular px-2 py-1.5 text-right">{m.teachers}</td>
                  <HoursCells row={m} />
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-navy"><tr><td className="px-2 py-2 font-bold" colSpan={3}>Total</td><HoursCells row={r.totals} /></tr></tfoot>
          </table>
        )}
        {view === 'cruzado' && (
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo"><tr><th className={th}>Professor</th><th className={th}>Área</th><th className={th}>Modalidade</th>{COLS.map((c) => <th key={c.key} className={cn(th, 'text-right')} title={c.title}>{c.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-borda">
              {r.byTeacherModality.map((x, i) => {
                const first = i === 0 || r.byTeacherModality[i - 1]!.teacherId !== x.teacherId;
                return (
                  <tr key={`${x.teacherId}-${x.modalityId}`} className={cn(first && i > 0 && 'border-t-2 border-borda')}>
                    <td className="px-2 py-1.5 font-semibold text-tinta">{first ? x.teacher : ''}</td>
                    <td className="px-2 py-1.5 text-xs text-tinta-suave">{x.area}</td>
                    <td className="px-2 py-1.5">{x.modality}</td>
                    <HoursCells row={x} />
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-navy"><tr><td className="px-2 py-2 font-bold" colSpan={3}>Total</td><HoursCells row={r.totals} /></tr></tfoot>
          </table>
        )}
        {view === 'aulas' && (
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo"><tr>{['Data', 'Início', 'Duração', 'Modalidade', 'Espaço', 'Quem', 'Situação'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-borda">
              {r.detail.map((o, i) => (
                <tr key={i} className={cn(o.status === 'CANCELADA' && 'text-tinta-fraca')}>
                  <td className="tabular whitespace-nowrap px-2 py-1.5">{formatDateBR(o.date)}</td>
                  <td className="tabular px-2 py-1.5">{o.start}</td>
                  <td className="tabular px-2 py-1.5">{formatMinutes(o.durationMin)}</td>
                  <td className="px-2 py-1.5">{o.modality}{o.label ? ` · ${o.label}` : ''}{!o.countsHours && <Badge tone="neutral" className="ml-1">{o.type}</Badge>}</td>
                  <td className="px-2 py-1.5 text-xs text-tinta-suave">{o.space ?? '—'}</td>
                  <td className="px-2 py-1.5 text-xs">
                    {o.people.map((p, j) => (
                      <span key={j} className="block">
                        {p.status === 'SUBSTITUIDA' ? <>{p.executing} <span className="text-tinta-fraca">(no lugar de {p.planned})</span></> : (p.executing ?? p.planned ?? '—')}
                      </span>
                    ))}
                  </td>
                  <td className="px-2 py-1.5 text-xs">{STATUS[o.status === 'PREVISTA' || o.status === 'REALIZADA' ? (o.people.find((p) => p.status !== 'PREVISTA' && p.status !== 'REALIZADA')?.status ?? o.status) : o.status]}{o.note ? ` · ${o.note}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {((view === 'aulas' && r.detail.length === 0) || (view !== 'aulas' && r.byTeacher.length === 0)) && (
          <p className="p-8 text-center text-sm text-tinta-suave">Nenhuma aula no período com esses filtros.</p>
        )}
      </Card>
      {view === 'aulas' && r.counts.detalheCortado && <p className="mt-2 text-xs text-atencao">Mostrando as primeiras 3.000 de {r.counts.detalhe} aulas. Filtre por professor ou modalidade, ou baixe o Excel.</p>}
      <p className="mt-3 text-xs text-tinta-fraca">
        Total = dadas + substituições + extras. Ausências, canceladas e aguardando não entram no total. Aulas do tipo Personal não contam horas.
      </p>
    </>
  );
}
