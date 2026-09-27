import ExcelJS from 'exceljs';
import type { Grid } from '@/domain/import/types';

/** Limites de segurança: planilha de grade é pequena; nada de ler arquivos gigantes. */
const MAX_ROWS = 2000;
const MAX_COLS = 60;

function cellText(c: ExcelJS.Cell): string {
  const v = c.value;
  if (v === null || v === undefined) return '';
  // Hora digitada como hora no Excel (07:00) chega como data de 1899: vira "07:00".
  if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`;
  if (typeof v === 'number' && c.numFmt && /h/i.test(c.numFmt) && v >= 0 && v < 1) {
    const min = Math.round(v * 24 * 60);
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? ''); // fórmula
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((t) => t.text).join('');
  try {
    return c.text ?? String(v);
  } catch {
    return String(v);
  }
}

/** Lê o .xlsx e devolve cada aba como grade de texto, marcando células mescladas. */
export async function readWorkbook(buffer: ArrayBuffer): Promise<{ name: string; grid: Grid }[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => {
    const rows = Math.min(ws.rowCount, MAX_ROWS);
    const cols = Math.min(ws.columnCount, MAX_COLS);
    const grid: Grid = [];
    for (let r = 1; r <= rows; r++) {
      const line = [];
      for (let c = 1; c <= cols; c++) {
        const cell = ws.getCell(r, c);
        const slave = cell.isMerged && cell.master.address !== cell.address;
        line.push({ text: cellText(slave ? cell.master : cell), slave });
      }
      grid.push(line);
    }
    return { name: ws.name, grid };
  });
}
