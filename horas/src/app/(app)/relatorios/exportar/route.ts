import { formatDateTime } from '@/lib/format';
import { getPrincipal } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { buildReportWorkbook } from '@/server/import/report-xlsx';
import { hoursReport, parseReportFilter } from '@/server/services/report-service';

export const dynamic = 'force-dynamic';

/** GET /relatorios/exportar?… — mesmos filtros da tela, em .xlsx. */
export async function GET(req: Request) {
  try {
    const principal = await getPrincipal();
    const filter = await parseReportFilter(Object.fromEntries(new URL(req.url).searchParams));
    const r = await hoursReport(principal, filter);
    const info = [
      r.labels.period,
      [r.labels.area && `Área: ${r.labels.area}`, r.labels.modality && `Modalidade: ${r.labels.modality}`, r.labels.teacher && `Professor: ${r.labels.teacher}`, r.labels.scope].filter(Boolean).join(' · ') || 'Todas as áreas',
      `Emitido em ${formatDateTime(new Date())} por ${principal!.name}. Horas em decimal: 1,5 = 1h30. Total = dadas + substituições + extras.`,
      ...(r.missing.length ? [`ATENÇÃO: sem aulas geradas para ${r.missing.join(', ')}.`] : []),
    ];
    const buffer = await buildReportWorkbook(r, info);
    const name = filter.mode === 'competencia'
      ? `nacao-horas-${filter.period.year}-${String(filter.period.month).padStart(2, '0')}.xlsx`
      : `nacao-horas-${filter.start}-a-${filter.end}.xlsx`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(e.message, { status: e.status });
    throw e;
  }
}
