import ExcelJS from 'exceljs';
import { formatDateBR } from '@/domain/dates';
import { toDecimalHours, type ReportRow } from '@/domain/report';
import type { HoursReportResult } from '@/server/services/report-service';

/** Relatório de horas em Excel: uma aba por visão, horas em decimal (1,5 = 1h30) para a contabilidade. */
const NAVY = 'FF022B57';
const HOURS: { key: keyof ReportRow; label: string }[] = [
  { key: 'plannedMin', label: 'Previstas (h)' },
  { key: 'ownMin', label: 'Dadas (h)' },
  { key: 'substitutionMin', label: 'Substituições (h)' },
  { key: 'extraMin', label: 'Extras (h)' },
  { key: 'absenceMin', label: 'Ausências (h)' },
  { key: 'cancelledMin', label: 'Canceladas (h)' },
  { key: 'pendingMin', label: 'Aguardando (h)' },
  { key: 'totalMin', label: 'TOTAL (h)' },
];
const STATUS: Record<string, string> = {
  PREVISTA: 'dada', REALIZADA: 'dada', SUBSTITUIDA: 'substituída', CANCELADA: 'cancelada',
  AUSENTE_PENDENTE: 'falta', AGUARDANDO_DECISAO_FERIADO: 'feriado: aguardando',
};

function sheet(wb: ExcelJS.Workbook, name: string, info: string[], head: string[], widths: number[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: info.length + 2 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  info.forEach((line, i) => {
    const c = ws.getCell(i + 1, 1);
    c.value = line;
    c.font = i === 0 ? { bold: true, size: 14, color: { argb: NAVY } } : { color: { argb: 'FF5B6B7F' } };
  });
  const row = ws.getRow(info.length + 2);
  row.values = head;
  row.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; });
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  return ws;
}

const hours = (r: ReportRow) => HOURS.map((h) => toDecimalHours(r[h.key] as number));

function totalRow(ws: ExcelJS.Worksheet, label: string[], r: ReportRow, firstHourCol: number) {
  const row = ws.addRow([...label, ...hours(r)]);
  row.font = { bold: true };
  row.border = { top: { style: 'medium', color: { argb: NAVY } } };
  for (let c = firstHourCol; c < firstHourCol + HOURS.length; c++) row.getCell(c).numFmt = '0.00';
}

export async function buildReportWorkbook(r: HoursReportResult, info: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NAÇÃO | Gestão de Horas';
  const fmtHours = (ws: ExcelJS.Worksheet, from: number) => { for (let c = from; c < from + HOURS.length; c++) ws.getColumn(c).numFmt = '0.00'; };

  const t = sheet(wb, 'Por professor', ['Horas por professor', ...info], ['Professor', 'Modalidades', ...HOURS.map((h) => h.label)], [34, 36, ...HOURS.map(() => 14)]);
  for (const x of r.byTeacher) t.addRow([x.teacher, x.modalities.join(', '), ...hours(x)]);
  fmtHours(t, 3);
  totalRow(t, ['TOTAL', `${r.byTeacher.length} pessoa(s)`], r.totals, 3);

  const m = sheet(wb, 'Por modalidade', ['Horas por modalidade', ...info], ['Área', 'Modalidade', 'Pessoas', ...HOURS.map((h) => h.label)], [20, 26, 10, ...HOURS.map(() => 14)]);
  for (const x of r.byModality) m.addRow([x.area, x.modality, x.teachers, ...hours(x)]);
  fmtHours(m, 4);
  totalRow(m, ['TOTAL', '', ''], r.totals, 4);

  const c = sheet(wb, 'Professor x modalidade', ['Horas por professor e modalidade', ...info], ['Professor', 'Área', 'Modalidade', ...HOURS.map((h) => h.label)], [34, 20, 26, ...HOURS.map(() => 14)]);
  for (const x of r.byTeacherModality) c.addRow([x.teacher, x.area, x.modality, ...hours(x)]);
  fmtHours(c, 4);
  totalRow(c, ['TOTAL', '', ''], r.totals, 4);

  const d = sheet(wb, 'Aula a aula', ['Aula a aula', ...info], ['Data', 'Início', 'Duração (h)', 'Modalidade', 'Turma', 'Tipo', 'Espaço', 'Previsto', 'Quem deu', 'Situação', 'Observação'], [12, 8, 11, 22, 16, 14, 18, 26, 26, 18, 30]);
  for (const o of r.detail) {
    for (const p of o.people.length ? o.people : [{ planned: null, executing: null, status: o.status, role: '', absenceReason: null }]) {
      const status = o.status === 'PREVISTA' || o.status === 'REALIZADA' ? p.status : o.status;
      d.addRow([formatDateBR(o.date), o.start, toDecimalHours(o.durationMin), o.modality, o.label ?? '', o.type, o.space ?? '', p.planned ?? '', p.executing ?? '', STATUS[status] ?? status, [o.note, p.absenceReason].filter(Boolean).join(' · ')]);
    }
  }
  d.getColumn(3).numFmt = '0.00';
  if (r.counts.detalheCortado) d.addRow([`Mostrando as primeiras 3.000 de ${r.counts.detalhe} aulas: filtre por professor ou modalidade.`]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
