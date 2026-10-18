import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { PrintButton } from '@/components/PrintButton';
import { FitSheet } from '@/components/print/FitSheet';
import { buttonVariants } from '@/components/ui/button';
import { WEEKDAYS, formatClock, formatDateBR, isIsoDate } from '@/domain/dates';
import { printDensity, printLines, type PrintMode, type TeacherInfo } from '@/domain/grade-print';
import { LEAVE_LABEL, type LeaveType } from '@/domain/leave';
import { isIntern } from '@/domain/staff-docs';
import { filterGrade, gradeParams } from '@/lib/grade-filter';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMinutes } from '@/lib/format';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listGrade } from '@/server/services/schedule-service';

export const metadata: Metadata = { title: 'Imprimir grade' };

type SP = { data?: string; area?: string; modalidade?: string; professor?: string; espaco?: string; auto?: string; equipe?: string; folhas?: string };

/** Tamanhos por densidade: a grade cabe em uma página A4 deitada sempre que possível. */
const SIZE = {
  normal: { table: 'text-[10.5px]', mod: 'text-[10px]', small: 'text-[9px]', pad: 'px-1 py-0.5' },
  compacta: { table: 'text-[9px]', mod: 'text-[8.5px]', small: 'text-[8px]', pad: 'px-0.5 py-px' },
  mini: { table: 'text-[7.5px]', mod: 'text-[7.5px]', small: 'text-[7px]', pad: 'px-0.5 py-0' },
} as const;

export default async function ImprimirGradePage({ searchParams }: { searchParams: Promise<SP> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'schedule.view')) redirect('/hoje');
  const sp = await searchParams;
  const mode: PrintMode = sp.equipe === 'professores' ? 'professores' : 'todos';
  // Padrão: tudo em uma folha, ocupando o papel inteiro. "Várias folhas" para grades enormes.
  const onePage = sp.folhas !== 'varias';
  const date = sp.data && isIsoDate(sp.data) ? sp.data : todayIso();
  const scoped = principal.areaIds === null ? {} : { id: { in: [...principal.areaIds] } };
  const area = sp.area ? await prisma.coordinationArea.findFirst({ where: { id: sp.area, ...scoped }, select: { id: true, name: true } }) : null;
  const [modality, teacher, space] = await Promise.all([
    sp.modalidade ? prisma.modality.findUnique({ where: { id: sp.modalidade }, select: { id: true, name: true } }) : null,
    sp.professor ? prisma.teacher.findUnique({ where: { id: sp.professor }, select: { id: true, name: true } }) : null,
    sp.espaco ? prisma.space.findUnique({ where: { id: sp.espaco }, select: { id: true, name: true } }) : null,
  ]);
  const filters = { modalityId: modality?.id ?? null, teacherId: teacher?.id ?? null, spaceId: space?.id ?? null };
  const grade = filterGrade(await listGrade(principal, date, area?.id ?? null), filters);

  // Vínculo (estagiário?) e nº do CREF de quem aparece na grade.
  const ids = [...new Set(grade.flatMap((g) => g.people.map((p) => p.teacherId)))];
  const teachers = await prisma.teacher.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, displayName: true, contractType: { select: { name: true } }, position: { select: { name: true } }, documents: { where: { kind: 'CREF', number: { not: null } }, select: { number: true, validUntil: true, createdAt: true } } },
  });
  const info = new Map<string, TeacherInfo>(teachers.map((t) => {
    const doc = [...t.documents].sort((a, b) => (b.validUntil?.getTime() ?? 0) - (a.validUntil?.getTime() ?? 0) || b.createdAt.getTime() - a.createdAt.getTime())[0];
    return [t.id, { intern: isIntern(t.contractType?.name, t.position?.name), cref: doc?.number ?? null }];
  }));
  const leaveLabel = (t: string) => LEAVE_LABEL[t as LeaveType] ?? t;
  const missingCref = mode === 'professores'
    ? teachers.filter((t) => !info.get(t.id)!.intern && !info.get(t.id)!.cref && grade.some((g) => g.people.some((p) => p.teacherId === t.id && p.role === 'TITULAR'))).map((t) => t.displayName || t.name).sort()
    : [];

  const days = WEEKDAYS.filter((w) => w.n <= 6 || grade.some((g) => g.weekday === 7));
  const times = [...new Set(grade.map((g) => g.startMin))].sort((a, b) => a - b);
  const cell = (weekday: number, start: number) => grade.filter((g) => g.weekday === weekday && g.startMin === start);
  const maxPerCell = Math.max(1, ...times.flatMap((t) => days.map((w) => cell(w.n, t).length)));
  // Em uma folha o encaixe (zoom) cuida do tamanho; em várias, a densidade reduz a letra.
  const size = SIZE[onePage ? 'normal' : printDensity(times.length, maxPerCell)];
  const counted = grade.filter((g) => g.activityType.kind !== 'PERSONAL');
  const personMin = teacher
    ? counted.reduce((s, g) => s + g.durationMin, 0)
    : counted.reduce((s, g) => s + g.durationMin * g.people.length, 0);
  const subtitle = [
    area ? `Área: ${area.name}` : principal.areaIds === null ? 'Todas as áreas' : 'Minhas áreas',
    modality && `Modalidade: ${modality.name}`,
    teacher && `Professor: ${teacher.name}`,
    space && `Espaço: ${space.name}`,
  ].filter(Boolean).join(' · ');
  const base = gradeParams({ date, areaId: area?.id ?? null, ...filters });
  const href = (m: PrintMode, one: boolean) => { const q = new URLSearchParams(base); q.set('auto', '0'); if (m === 'professores') q.set('equipe', 'professores'); if (!one) q.set('folhas', 'varias'); return `/grade/imprimir?${q}`; };
  const hrefMode = (m: PrintMode) => href(m, onePage);

  return (
    <div className="print-grade">
      {/* A4 deitado, margens curtas, cores das modalidades no papel, linhas que não quebram entre páginas e cabeçalho repetido. */}
      <style>{`
        @page { size: A4 landscape; margin: 7mm; }
        .print-grade * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .print-grade thead { display: table-header-group; }
        .print-grade tr, .print-grade .entry { break-inside: avoid; page-break-inside: avoid; }
        @media print { html, body { background: #fff !important; } }
      `}</style>

      <div className="mb-4 space-y-2 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/grade?${base}`} className={buttonVariants({ variant: 'ghost' })}>← Voltar para a grade</Link>
          <div className="inline-flex rounded-lg border border-borda bg-white p-0.5 text-sm font-semibold">
            <Link href={hrefMode('todos')} className={cn('rounded-md px-3 py-1.5', mode === 'todos' ? 'bg-navy text-white' : 'text-tinta-suave')}>Equipe completa</Link>
            <Link href={hrefMode('professores')} className={cn('rounded-md px-3 py-1.5', mode === 'professores' ? 'bg-navy text-white' : 'text-tinta-suave')}>Só professores (com CREF)</Link>
          </div>
          <div className="inline-flex rounded-lg border border-borda bg-white p-0.5 text-sm font-semibold">
            <Link href={href(mode, true)} className={cn('rounded-md px-3 py-1.5', onePage ? 'bg-navy text-white' : 'text-tinta-suave')}>Uma folha (ocupa o papel todo)</Link>
            <Link href={href(mode, false)} className={cn('rounded-md px-3 py-1.5', !onePage ? 'bg-navy text-white' : 'text-tinta-suave')}>Várias folhas</Link>
          </div>
          <div className="flex-1" />
          <p className="text-xs text-tinta-fraca">Na impressão: “Paisagem”, margens “Padrão” e escala 100%. “Salvar como PDF” para o WhatsApp.</p>
          <PrintButton auto={sp.auto !== '0'} />
        </div>
        {missingCref.length > 0 && (
          <p className="rounded-lg bg-atencao/10 px-3 py-2 text-sm text-atencao">
            Sem nº do CREF na pasta ({missingCref.length}): {missingCref.join(', ')}. {can(principal, 'teacher.docs') && <Link href="/professores/documentos" className="font-semibold underline">Cadastrar em Documentos da equipe</Link>}
          </p>
        )}
      </div>

      <FitSheet enabled={onePage}>
      <div className="mb-2 flex items-end justify-between border-b-2 border-navy pb-1.5">
        <div>
          <div className="text-navy"><Logo tone="light" /></div>
          <h1 className="mt-1 text-lg font-extrabold leading-tight text-navy">{teacher ? `Grade de ${teacher.name}` : mode === 'professores' ? 'Grade semanal — Professores responsáveis' : 'Grade semanal'}</h1>
          <p className="text-xs text-tinta-suave">Valendo em {formatDateBR(date)} · {subtitle}</p>
        </div>
        <div className="text-right text-[11px] text-tinta-suave">
          <p><b className="text-navy">{grade.length}</b> atividade(s)/semana{mode === 'todos' && <> · <b className="text-navy">{formatMinutes(personMin)}</b> {teacher ? 'de aula' : 'de professor'}/semana</>}</p>
          <p>Emitido em {formatDateTime(new Date())}</p>
        </div>
      </div>

      {grade.length === 0 ? (
        <p className="p-10 text-center text-sm text-tinta-suave">Nenhuma aula com esses filtros nessa data.</p>
      ) : (
        <table className={cn('w-full table-fixed border-collapse leading-tight', size.table)}>
          <thead>
            <tr>
              <th className="w-11 border border-navy bg-navy px-1 py-1 text-white">Hora</th>
              {days.map((w) => <th key={w.n} className="border border-navy bg-navy px-1 py-1 font-bold uppercase tracking-wide text-white">{w.long}</th>)}
            </tr>
          </thead>
          <tbody>
            {times.map((t, i) => (
              <tr key={t} className={i % 2 ? 'bg-fundo/60' : ''}>
                <td className="tabular border border-borda bg-fundo px-0.5 py-0.5 text-center align-top font-bold text-navy">{formatClock(t)}</td>
                {days.map((w) => (
                  <td key={w.n} className="border border-borda p-0.5 align-top">
                    {cell(w.n, t).map((g) => {
                      const lines = printLines(g.people, mode, info, leaveLabel);
                      return (
                        <div key={g.id} className={cn('entry mb-0.5 rounded-sm last:mb-0', size.pad)} style={{ borderLeft: `3px solid ${g.modality.color}`, background: `${g.modality.color}14` }}>
                          {/* Linha 1: modalidade · duração · turma · tipo/espaço. Linha 2: quem dá a aula. */}
                          <p className={cn('leading-tight', size.mod)}>
                            <b className="font-extrabold uppercase" style={{ color: g.modality.color }}>{g.modality.name}</b>
                            {[g.durationMin !== 60 ? formatMinutes(g.durationMin) : null, g.label, g.activityType.kind !== 'AULA' ? g.activityType.name : null, g.space?.name]
                              .filter(Boolean).map((x, k) => <span key={k} className="font-semibold text-tinta-suave"> · {x}</span>)}
                          </p>
                          {lines.length ? (
                            <p className="text-tinta">
                              {lines.map((l, j) => (
                                <span key={j}>
                                  {j > 0 && <span className="text-tinta-fraca">, </span>}
                                  <span className="font-semibold">{l.name}{l.aux ? '*' : ''}</span>
                                  {mode === 'professores' && <span className={cn('whitespace-nowrap', size.small, l.cref ? 'text-tinta-suave' : 'text-tinta-fraca')}> {l.cref ?? 'CREF —'}</span>}
                                  {l.note && <span className={cn('text-tinta-suave', size.small)}> ({l.note})</span>}
                                </span>
                              ))}
                            </p>
                          ) : <p className="font-semibold text-critico">{mode === 'professores' ? 'professor a definir' : 'sem professor'}</p>}
                        </div>
                      );
                    })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-1.5 text-[9px] text-tinta-fraca">
        {mode === 'professores'
          ? 'Professores responsáveis pelas aulas, com registro no CREF. Duração de 1h quando não indicada.'
          : '* auxiliar ou estagiário. Duração de 1h quando não indicada. Personal não conta horas.'}
      </p>
      </FitSheet>
    </div>
  );
}
