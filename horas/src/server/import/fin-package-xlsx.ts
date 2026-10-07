import ExcelJS from 'exceljs';
import type { Cell, Sheets } from '@/domain/financeiro/package';

/** .xlsx → abas como matriz de valores (resultado das fórmulas), para o leitor puro do pacote histórico. */
export async function readPackageWorkbook(buffer: ArrayBuffer): Promise<Sheets> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const out: Sheets = {};
  const plain = (x: unknown): Cell => {
    if (x === null || x === undefined) return null;
    if (typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean' || x instanceof Date) return x;
    if (typeof x === 'object' && 'richText' in (x as object)) return (x as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
    if (typeof x === 'object' && 'result' in (x as object)) return plain((x as { result?: unknown }).result);
    if (typeof x === 'object' && 'text' in (x as object)) return String((x as { text: string }).text);
    return null; // erro (#REF!, #DIV/0!)
  };
  for (const ws of wb.worksheets) {
    const rows: Cell[][] = [];
    const n = Math.min(ws.rowCount, 5000);
    const cols = Math.min(ws.columnCount, 40);
    for (let r = 1; r <= n; r++) {
      const row: Cell[] = [];
      for (let c = 1; c <= cols; c++) row.push(plain(ws.getCell(r, c).value));
      rows.push(row);
    }
    out[ws.name.trim().toUpperCase()] = rows;
  }
  return out;
}
