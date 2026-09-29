import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { PrintButton } from '@/components/PrintButton';
import { buttonVariants } from '@/components/ui/button';
import { WEEKDAYS, formatClock, formatDateBR, isIsoDate } from '@/domain/dates';
import { LEAVE_LABEL, type LeaveType } from '@/domain/leave';
import { filterGrade, gradeParams } from '@/lib/grade-filter';
import { formatDateTime, formatMinutes } from '@/lib/format';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listGrade } from '@/server/services/schedule-service';

export const metadata: Metadata = { title: 'Imprimir grade' };

type SP = { data?: string; area?: string; modalidade?: string; professor?: string; espaco?: string; auto?: string };

export default async function ImprimirGradePage({ searchParams }: { searchParams: Promise<SP> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'schedule.view')) redirect('/hoje');
  const sp = await searchParams;
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

  const days = WEEKDAYS.filter((w) => w.n <= 6 || grade.some((g) => g.weekday === 7));
  const times = [...new Set(grade.map((g) => g.startMin))].sort((a, b) => a - b);
  const cell = (weekday: number, start: number) => grade.filter((g) => g.weekday === weekday && g.startMin === start);
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

  return (
    <div className="print-grade">
      {/* Paisagem, margens curtas e cores das modalidades no papel. */}
      <style>{`@page { size: A4 landscape; margin: 8mm; } .print-grade * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }`}</style>

      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/grade?${gradeParams({ date, areaId: area?.id ?? null, ...filters })}`} className={buttonVariants({ variant: 'ghost' })}>← Voltar para a grade</Link>
        <div className="flex-1" />
        <p className="text-xs text-tinta-fraca">Dica: na janela de impressão, escolha “Salvar como PDF” para enviar por WhatsApp.</p>
        <PrintButton auto={sp.auto !== '0'} />
      </div>

      <div className="mb-3 flex items-end justify-between border-b-2 border-navy pb-2">
        <div>
          <div className="text-navy"><Logo tone="light" /></div>
          <h1 className="mt-2 text-xl font-extrabold text-navy">{teacher ? `Grade de ${teacher.name}` : 'Grade semanal'}</h1>
          <p className="text-sm text-tinta-suave">Valendo em {formatDateBR(date)} · {subtitle}</p>
        </div>
        <div className="text-right text-xs text-tinta-suave">
          <p><b className="text-navy">{grade.length}</b> atividade(s)/semana · <b className="text-navy">{formatMinutes(personMin)}</b> {teacher ? 'de aula' : 'de professor'}/semana</p>
          <p>Emitido em {formatDateTime(new Date())}</p>
        </div>
      </div>

      {grade.length === 0 ? (
        <p className="p-10 text-center text-sm text-tinta-suave">Nenhuma aula com esses filtros nessa data.</p>
      ) : (
        <table className="w-full table-fixed border-collapse text-[10.5px] leading-tight">
          <thead>
            <tr>
              <th className="w-14 border border-borda bg-navy px-1 py-1.5 text-white">Hora</th>
              {days.map((w) => <th key={w.n} className="border border-borda bg-navy px-1 py-1.5 font-bold uppercase tracking-wide text-white">{w.long}</th>)}
            </tr>
          </thead>
          <tbody>
            {times.map((t) => (
              <tr key={t}>
                <td className="tabular border border-borda bg-fundo px-1 py-1 text-center align-top font-bold text-navy">{formatClock(t)}</td>
                {days.map((w) => (
                  <td key={w.n} className="border border-borda p-0.5 align-top">
                    {cell(w.n, t).map((g) => (
                      <div key={g.id} className="mb-0.5 rounded-sm px-1 py-0.5 last:mb-0" style={{ borderLeft: `3px solid ${g.modality.color}`, background: `${g.modality.color}14` }}>
                        <p className="font-extrabold uppercase" style={{ color: g.modality.color }}>
                          {g.modality.name}{g.durationMin !== 60 && <span className="font-semibold normal-case text-tinta-suave"> · {formatMinutes(g.durationMin)}</span>}
                        </p>
                        {g.label && <p className="font-semibold text-tinta-suave">{g.label}</p>}
                        <p className="text-tinta">{g.people.length ? g.people.map((p) => `${p.role === 'TITULAR' ? p.name : `${p.name}*`}${p.leave ? ` (${LEAVE_LABEL[p.leave.type as LeaveType].toLowerCase()}${p.leave.substitute ? ` → ${p.leave.substitute}` : ''})` : ''}`).join(', ') : <span className="font-semibold text-critico">sem professor</span>}</p>
                        {(g.space || g.activityType.kind !== 'AULA') && (
                          <p className="text-[9.5px] text-tinta-fraca">{[g.activityType.kind !== 'AULA' ? g.activityType.name : null, g.space?.name].filter(Boolean).join(' · ')}</p>
                        )}
                      </div>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-[10px] text-tinta-fraca">* auxiliar ou estagiário. Duração de 1h quando não indicada. Personal não conta horas.</p>
    </div>
  );
}
