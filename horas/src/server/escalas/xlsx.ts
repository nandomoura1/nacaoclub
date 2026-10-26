import ExcelJS from 'exceljs';
import { formatDateBR, WEEKDAYS } from '@/domain/dates';
import { BOND_LABEL, CELL_FILL, CELL_LABEL, STATUS_LABEL, cellText, fmtHours } from '@/domain/escalas/labels';
import { CLASSIFICATION_LABEL } from '@/domain/escalas/validate';
import type { MonthView } from '@/server/services/ws-service';

/** Planilha da escala mensal: grade (pessoas × dias), resumo por pessoa e alertas. */
export async function scheduleXlsx(v: MonthView): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nação ADM';
  const a = v.analysis!;
  const ws = wb.addWorksheet('Escala', { views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.addRow([`Escala ${v.sector.name} — ${v.month.label}`]).font = { bold: true, size: 14 };
  ws.addRow([`${STATUS_LABEL[v.schedule!.status]} · ${CLASSIFICATION_LABEL[a.classification]}`]);
  const days = v.month.days;
  const plan = new Map(v.days.map((d) => [d.date, d]));
  const head = ws.addRow(['Colaborador', 'Função / vínculo', ...days.map((d) => `${d.slice(8)} ${WEEKDAYS[plan.get(d)!.weekday - 1]!.short}${plan.get(d)!.holiday ? ' ★' : ''}`), 'Horas', 'Dias', 'Folgas', 'Sáb', 'Dom', 'Banco']);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF022B57' } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
  const stats = new Map(a.members.map((s) => [s.memberId, s]));
  for (const m of v.members) {
    const st = stats.get(m.id);
    const row = ws.addRow([m.name, [m.functionName, BOND_LABEL[m.bond]].filter(Boolean).join(' · '), ...days.map((d) => cellText(v.grid[m.id]?.[d])), st ? fmtHours(st.minutes) : '', st?.days ?? '', st?.offs ?? '', st?.saturdays ?? '', st?.sundays ?? '', st?.balanceMin == null ? '' : fmtHours(st.balanceMin)]);
    days.forEach((d, i) => {
      const c = v.grid[m.id]?.[d];
      if (!c) return;
      const cell = row.getCell(3 + i);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CELL_FILL[c.kind] } };
      cell.alignment = { horizontal: 'center' };
      if (c.note) cell.note = c.note;
    });
  }
  ws.getColumn(1).width = 22; ws.getColumn(2).width = 18;
  for (let i = 0; i < days.length; i++) ws.getColumn(3 + i).width = 10;
  ws.addRow([]);
  ws.addRow(['Legenda: ' + (['FOLGA', 'FERIAS', 'ATESTADO', 'FALTA', 'AFASTAMENTO', 'INDISPONIVEL', 'FECHADO'] as const).map((k) => CELL_LABEL[k]).join(' · ') + ' · ★ feriado']);

  const al = wb.addWorksheet('Alertas');
  al.addRow(['Nível', 'Data', 'Mensagem', 'Sugestões']).font = { bold: true };
  for (const x of a.alerts) al.addRow([x.level, x.date ? formatDateBR(x.date) : '', x.message, (x.suggestions ?? []).join(' · ')]);
  al.getColumn(3).width = 90; al.getColumn(4).width = 60;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
