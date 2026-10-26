import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { PrintButton } from '@/components/PrintButton';
import { FitSheet } from '@/components/print/FitSheet';
import { buttonVariants } from '@/components/ui/button';
import { formatDateBR, WEEKDAYS } from '@/domain/dates';
import { BOND_LABEL, CELL_LABEL, CELL_TONE, STATUS_LABEL, cellText, fmtHours } from '@/domain/escalas/labels';
import { CLASSIFICATION_LABEL } from '@/domain/escalas/validate';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { scheduleById } from '@/server/services/ws-service';

export const metadata: Metadata = { title: 'Imprimir escala' };

export default async function ImprimirEscalaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ auto?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'ws.view')) redirect('/hoje');
  const { id } = await params;
  const sp = await searchParams;
  const v = await scheduleById(principal, id);
  const a = v.analysis!;
  const plan = new Map(v.days.map((d) => [d.date, d]));
  const stats = new Map(a.members.map((s) => [s.memberId, s]));
  const mes = `${v.month.year}-${String(v.month.month).padStart(2, '0')}`;
  const special = v.month.days.map((d) => plan.get(d)!).filter((d) => d.holiday || d.events.length || d.notes.length);
  return (
    <div className="print-escala">
      <style>{`
        @page { size: A4 landscape; margin: 7mm; }
        .print-escala * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .print-escala tr { break-inside: avoid; }
        @media print { html, body { background: #fff !important; } }
      `}</style>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/escalas-trabalho?setor=${v.sector.id}&mes=${mes}`} className={buttonVariants({ variant: 'ghost' })}>← Voltar para a escala</Link>
        <div className="flex-1" />
        <p className="text-xs text-tinta-fraca">“Paisagem” e “Salvar como PDF” para enviar.</p>
        <PrintButton auto={sp.auto !== '0'} />
      </div>
      <FitSheet enabled>
        <div className="mb-2 flex items-end justify-between border-b-2 border-navy pb-1.5">
          <div>
            <div className="text-navy"><Logo tone="light" /></div>
            <h1 className="mt-1 text-lg font-extrabold leading-tight text-navy">Escala de trabalho — {v.sector.name} · {v.month.label}</h1>
            <p className="text-xs text-tinta-suave">{STATUS_LABEL[v.schedule!.status]} · {CLASSIFICATION_LABEL[a.classification]}</p>
          </div>
          <p className="text-right text-[11px] text-tinta-suave">Emitido em {formatDateTime(new Date())}</p>
        </div>
        <table className="w-full table-fixed border-collapse text-[8.5px] leading-tight">
          <thead>
            <tr>
              <th className="w-28 border border-navy bg-navy px-1 py-0.5 text-left text-white">Colaborador</th>
              {v.month.days.map((d) => { const p = plan.get(d)!; return <th key={d} className={cn('border border-navy px-0 py-0.5 text-white', p.holiday ? 'bg-nacao' : p.weekday >= 6 ? 'bg-navy-700' : 'bg-navy')}>{d.slice(8)}<br />{WEEKDAYS[p.weekday - 1]!.short.slice(0, 1)}</th>; })}
              <th className="w-10 border border-navy bg-navy text-white">Horas</th>
            </tr>
          </thead>
          <tbody>
            {v.members.map((m) => (
              <tr key={m.id}>
                <td className="border border-borda px-1 py-0.5"><b className="text-navy">{m.name}</b><br /><span className="text-[7.5px] text-tinta-suave">{[m.functionName, BOND_LABEL[m.bond]].filter(Boolean).join(' · ')}</span></td>
                {v.month.days.map((d) => { const c = v.grid[m.id]?.[d]; return <td key={d} className={cn('border border-borda px-0 py-0.5 text-center font-semibold', c ? CELL_TONE[c.kind] : '')}>{cellText(c)}</td>; })}
                <td className="border border-borda text-center font-bold text-navy">{fmtHours(stats.get(m.id)?.minutes ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[8px] text-tinta-suave">Legenda: {(['FOLGA', 'FERIAS', 'ATESTADO', 'FALTA', 'AFASTAMENTO', 'FECHADO'] as const).map((k) => CELL_LABEL[k]).join(' · ')} · coluna azul = feriado.{special.length ? ` Datas: ${special.map((d) => `${formatDateBR(d.date).slice(0, 5)} ${[d.holiday?.name, ...d.events.map((e) => e.name)].filter(Boolean).join(', ') || d.notes[0]}`).join(' · ')}` : ''}</p>
      </FitSheet>
    </div>
  );
}
