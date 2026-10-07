import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { Cell, Sheets } from '@/domain/financeiro/package';

/**
 * O exceljs quebra ao carregar planilhas com "Formatar como Tabela" (ListObjects).
 * Os valores estão nas células; a tabela é só formatação/metadado — removemos
 * essa camada (arquivos xl/tables, <tableParts> e as relações) antes de ler.
 */
async function withoutTables(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer);
  const tables = Object.keys(zip.files).filter((f) => /^xl\/tables\//.test(f));
  if (!tables.length) return buffer;
  for (const f of tables) zip.remove(f);
  for (const f of Object.keys(zip.files)) {
    if (/^xl\/worksheets\/sheet[^/]*\.xml$/.test(f)) {
      const xml = await zip.file(f)!.async('string');
      zip.file(f, xml.replace(/<tableParts\b[^>]*\/>/g, '').replace(/<tableParts\b[\s\S]*?<\/tableParts>/g, ''));
    } else if (/^xl\/worksheets\/_rels\/.*\.rels$/.test(f)) {
      const xml = await zip.file(f)!.async('string');
      zip.file(f, xml.replace(/<Relationship\b[^>]*Type="[^"]*\/table"[^>]*\/>/g, ''));
    } else if (f === '[Content_Types].xml') {
      const xml = await zip.file(f)!.async('string');
      zip.file(f, xml.replace(/<Override\b[^>]*PartName="\/xl\/tables\/[^"]*"[^>]*\/>/g, ''));
    }
  }
  return zip.generateAsync({ type: 'arraybuffer' });
}

/** .xlsx → abas como matriz de valores (resultado das fórmulas), para o leitor puro do pacote histórico. */
export async function readPackageWorkbook(buffer: ArrayBuffer): Promise<Sheets> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await withoutTables(buffer));
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
