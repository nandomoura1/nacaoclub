import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, BarChart3, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { formatDateBR, isIsoDate } from '@/domain/dates';
import { periodKey, periodLabel, periodOf, shiftPeriod } from '@/domain/period';
import { cn } from '@/lib/cn';
import { filterGrade } from '@/lib/grade-filter';
import { formatMinutes, initials } from '@/lib/format';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listLeaves } from '@/server/services/leave-service';
import { periodStartDay } from '@/server/services/period-service';
import { hoursReport, parseReportFilter } from '@/server/services/report-service';
import { listGrade } from '@/server/services/schedule-service';
import { teacherShareData } from '@/server/services/teacher-share-service';
import { ShareGrade } from './ShareClient';
import { AulasTab, AusenciasTab } from './FichaClient';

export const metadata: Metadata = { title: 'Ficha do professor' };

const TABS = [
  { key: 'aulas', label: 'Aulas fixas' },
  { key: 'ausencias', label: 'Ausências e exceções' },
  { key: 'horas', label: 'Horas' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const STATUS: Record<string, string> = {
  PREVISTA: 'dada', REALIZADA: 'dada', SUBSTITUIDA: 'substituída', CANCELADA: 'cancelada',
  AUSENTE_PENDENTE: 'aguardando substituto', AGUARDANDO_DECISAO_FERIADO: 'feriado: aguardando',
};

export default async function FichaPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string; data?: string; competencia?: string; compartilhar?: string }>;
}) {
  const principal = await requirePrincipal();
  if (!can(principal, 'teacher.view')) redirect('/hoje');
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const teacher = await prisma.teacher.findUnique({
    where: { id },
    include: { position: true, contractType: true, modalities: { include: { modality: { select: { id: true, name: true, color: true } } } } },
  });
  if (!teacher) notFound();

  const canHours = can(principal, 'payroll.view_hours');
  const tabs = TABS.filter((t) => t.key !== 'horas' || canHours);
  const tab: Tab = tabs.some((t) => t.key === sp.aba) ? (sp.aba as Tab) : 'aulas';
  const today = todayIso();
  const date = sp.data && isIsoDate(sp.data) ? sp.data : today;
  const base = `/professores/${id}`;
  const share = can(principal, 'schedule.view') ? await teacherShareData(principal, id, date) : null;

  return (
    <>
      <Link href="/professores" className="mb-3 inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-nacao print:hidden"><ArrowLeft className="size-4" /> Professores</Link>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-navy text-lg font-bold text-white">{initials(teacher.displayName || teacher.name)}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-navy">{teacher.name}{!teacher.active && <Badge tone="red" className="ml-2 align-middle">inativo</Badge>}</h1>
          <p className="text-sm text-tinta-suave">
            {[teacher.displayName && `“${teacher.displayName}” na grade`, teacher.position?.name, teacher.contractType?.name, teacher.admissionDate && `desde ${formatDateBR(teacher.admissionDate.toISOString().slice(0, 10))}`].filter(Boolean).join(' · ') || 'Cadastro básico'}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {teacher.modalities.map((m) => (
              <Badge key={m.modality.id} tone="neutral"><span className="size-2 rounded-full" style={{ background: m.modality.color }} />{m.modality.name}</Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {share && <ShareGrade teacherId={id} data={share} autoOpen={sp.compartilhar === '1'} />}
          <a href={`/grade/imprimir?professor=${id}&data=${date}`} target="_blank" rel="noopener" className={buttonVariants({ variant: 'secondary' })}><Printer /> Imprimir grade dele</a>
        </div>
      </div>

      <nav className="mb-4 flex gap-1 border-b border-borda print:hidden">
        {tabs.map((t) => (
          <Link key={t.key} href={`${base}?aba=${t.key}`}
            className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-semibold', t.key === tab ? 'border-nacao text-navy' : 'border-transparent text-tinta-suave hover:text-navy')}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'aulas' && <AulasSection principal={principal} teacherId={id} teacherName={teacher.displayName || teacher.name} date={date} today={today} />}
      {tab === 'ausencias' && <AusenciasSection principal={principal} teacherId={id} today={today} />}
      {tab === 'horas' && <HorasSection principal={principal} teacherId={id} competencia={sp.competencia} base={base} />}
    </>
  );
}

type P = Awaited<ReturnType<typeof requirePrincipal>>;

async function AulasSection({ principal, teacherId, teacherName, date, today }: { principal: P; teacherId: string; teacherName: string; date: string; today: string }) {
  const areaScope = principal.areaIds === null ? {} : { areaId: { in: [...principal.areaIds] } };
  const [grade, modalities, activityTypes, spaces, teachers] = await Promise.all([
    listGrade(principal, date),
    prisma.modality.findMany({ where: { active: true, ...areaScope }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, color: true, areaId: true, defaultDurationMin: true } }),
    prisma.activityType.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, kind: true } }),
    prisma.space.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.teacher.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, displayName: true, modalities: { select: { modalityId: true } } } }),
  ]);
  return (
    <AulasTab
      teacherId={teacherId}
      teacherName={teacherName}
      date={date}
      today={today}
      grade={filterGrade(grade, { teacherId, modalityId: null, spaceId: null })}
      sheet={{
        canEdit: can(principal, 'schedule.edit'),
        modalities, activityTypes, spaces,
        teachers: teachers.map((t) => ({ id: t.id, name: t.displayName || t.name, fullName: t.name, modalityIds: t.modalities.map((m) => m.modalityId) })),
      }}
    />
  );
}

async function AusenciasSection({ principal, teacherId, today }: { principal: P; teacherId: string; today: string }) {
  const [leaves, me, others] = await Promise.all([
    listLeaves(principal, teacherId),
    prisma.teacherModality.findMany({ where: { teacherId }, select: { modalityId: true } }),
    prisma.teacher.findMany({ where: { active: true, id: { not: teacherId } }, orderBy: { name: 'asc' }, select: { id: true, name: true, modalities: { select: { modalityId: true } } } }),
  ]);
  const mine = new Set(me.map((m) => m.modalityId));
  const suggested = others.filter((t) => t.modalities.some((m) => mine.has(m.modalityId)));
  return (
    <AusenciasTab
      teacherId={teacherId}
      leaves={leaves}
      today={today}
      canManage={can(principal, 'leave.manage')}
      substitutes={{
        suggested: suggested.map((t) => ({ id: t.id, name: t.name })),
        others: others.filter((t) => !suggested.includes(t)).map((t) => ({ id: t.id, name: t.name })),
      }}
    />
  );
}

async function HorasSection({ principal, teacherId, competencia, base }: { principal: P; teacherId: string; competencia?: string; base: string }) {
  const filter = await parseReportFilter({ competencia, professor: teacherId });
  const r = await hoursReport(principal, filter);
  const me = r.byTeacher[0];
  const startDay = await periodStartDay();
  const current = periodOf(todayIso(), startDay);
  const periods = Array.from({ length: 13 }, (_, i) => shiftPeriod(current, 1 - i));
  const cards = me ? [
    ['Previstas', me.plannedMin], ['Dadas', me.ownMin], ['Substituições', me.substitutionMin], ['Extras', me.extraMin],
    ['Ausências', me.absenceMin], ['Canceladas', me.cancelledMin], ['Aguardando', me.pendingMin],
  ] as const : [];

  return (
    <>
      <form className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <input type="hidden" name="aba" value="horas" />
        <Select name="competencia" defaultValue={periodKey(filter.period)} className="w-48" aria-label="Competência">
          {periods.map((p) => <option key={periodKey(p)} value={periodKey(p)}>{periodLabel(p)}</option>)}
        </Select>
        <button className={buttonVariants({ variant: 'secondary' })}>Ver</button>
        <div className="flex-1" />
        <Link href={`/relatorios?competencia=${periodKey(filter.period)}&professor=${teacherId}&visao=aulas`} className={buttonVariants({ variant: 'ghost' })}><BarChart3 /> Abrir no relatório</Link>
      </form>
      <p className="mb-3 text-sm text-tinta-suave">{r.labels.period}{r.missing.length ? ` · sem aulas geradas para ${r.missing.join(', ')}` : ''}</p>
      {!me ? (
        <Card className="p-8 text-center text-sm text-tinta-suave">Nenhuma aula nesta competência.</Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Card className="col-span-2 bg-navy p-4 text-white sm:col-span-1">
              <p className="tabular text-2xl font-extrabold">{formatMinutes(me.totalMin)}</p>
              <p className="text-xs text-white/70">total a pagar</p>
            </Card>
            {cards.map(([label, min]) => (
              <Card key={label} className="p-4">
                <p className={cn('tabular text-lg font-extrabold', min ? 'text-navy' : 'text-tinta-fraca')}>{formatMinutes(min)}</p>
                <p className="text-xs text-tinta-fraca">{label}</p>
              </Card>
            ))}
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-borda bg-fundo text-left text-[11px] font-bold uppercase tracking-wide text-tinta-suave">
                <tr><th className="px-2 py-2">Data</th><th className="px-2 py-2">Hora</th><th className="px-2 py-2">Aula</th><th className="px-2 py-2">Situação</th></tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {r.detail.map((o, i) => {
                  const mine = o.people.find((p) => p.plannedId === teacherId) ?? o.people.find((p) => p.executingId === teacherId);
                  const covering = mine && mine.plannedId !== teacherId;
                  const status = o.status === 'PREVISTA' || o.status === 'REALIZADA' ? (mine?.status ?? o.status) : o.status;
                  return (
                    <tr key={i} className={cn((status === 'CANCELADA' || status === 'AUSENTE_PENDENTE') && 'text-tinta-fraca')}>
                      <td className="tabular whitespace-nowrap px-2 py-1.5">{formatDateBR(o.date)}</td>
                      <td className="tabular px-2 py-1.5">{o.start} · {formatMinutes(o.durationMin)}</td>
                      <td className="px-2 py-1.5">{o.modality}{o.label ? ` · ${o.label}` : ''}</td>
                      <td className="px-2 py-1.5 text-xs">
                        {covering ? <b className="text-nacao">substituiu {mine.planned ?? '—'}</b> : (STATUS[status] ?? status)}
                        {!covering && mine?.status === 'SUBSTITUIDA' && <span className="text-tinta-suave"> · {mine.executing ?? 'ninguém'} deu a aula</span>}
                        {o.note ? ` · ${o.note}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
