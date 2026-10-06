import ExcelJS from 'exceljs';
import type { Sheet, SheetCell } from '@/domain/condominio/import';

/** .xlsx → abas com valor e fórmula de cada célula (para o leitor puro de domain/condominio/import). */
export async function readCondoWorkbook(buffer: ArrayBuffer): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => ({
    name: ws.name,
    rows: Math.min(ws.rowCount, 2000),
    cell(row: number, col: number): SheetCell {
      const c = ws.getCell(row, col);
      // Célula mesclada: só a primeira (master) tem o valor; as outras ficam vazias.
      if (c.isMerged && c.master.address !== c.address) return { value: null, formula: null };
      const v = c.value as unknown;
      const formula = c.type === ExcelJS.ValueType.Formula ? `=${c.formula ?? ''}` : null;
      const plain = (x: unknown): SheetCell['value'] => {
        if (x === null || x === undefined) return null;
        if (typeof x === 'number' || typeof x === 'string' || x instanceof Date) return x;
        if (typeof x === 'boolean') return x ? 1 : 0;
        if (typeof x === 'object' && 'richText' in (x as object)) return (x as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
        if (typeof x === 'object' && 'text' in (x as object)) return String((x as { text: string }).text);
        return null; // erro (#REF!, #DIV/0!)
      };
      if (formula) return { value: plain((v as { result?: unknown })?.result), formula };
      return { value: plain(v), formula: null };
    },
  }));
}
