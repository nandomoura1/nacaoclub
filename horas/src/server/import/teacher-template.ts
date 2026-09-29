import ExcelJS from 'exceljs';
import { TEACHER_COLUMNS } from '@/domain/import/teachers';

/**
 * Planilha de professores: uma pessoa por linha, com listas do cadastro
 * (cargo, contrato, modalidades). Em branco ou espelho do cadastro atual.
 */
export interface TeacherTemplateCatalog {
  modalities: string[];
  positions: string[];
  contractTypes: string[];
}

export interface TeacherTemplateRow {
  name: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  contractType: string | null;
  level: string | null;
  primaryModality: string | null;
  modalities: string[];
  admissionDate: string | null;
  terminationDate: string | null;
  active: boolean;
  aliases: string[];
  notes: string | null;
}

const NAVY = 'FF022B57';
const BLUE = 'FF0169E9';
const MAX_ROWS = 400;
const WIDTHS = [30, 18, 28, 16, 16, 14, 10, 22, 34, 13, 13, 8, 30, 36];
const HELP = [
  'Obrigatório. É por ele que o sistema acha a pessoa',
  'Nome curto: Rafa, Ju',
  'Opcional',
  'Opcional',
  'Escolha na lista',
  'Escolha na lista',
  'Livre: I, II, Sênior…',
  'Escolha na lista',
  'Separe com /: CrossFit / HYROX',
  'dd/mm/aaaa',
  'dd/mm/aaaa (só se saiu)',
  'Sim ou Não (vazio = Sim para quem é novo)',
  'Como o nome aparece na planilha antiga, separados por /',
  'Livre',
];

/** "2024-03-01" → "01/03/2024" */
const br = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

export async function buildTeacherTemplate(cat: TeacherTemplateCatalog, rows: TeacherTemplateRow[], title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nação ADM';
  wb.created = new Date();

  const ins = wb.addWorksheet('Instruções', { properties: { tabColor: { argb: BLUE } } });
  ins.getColumn(1).width = 110;
  const lines: [string, 'h1' | 'h2' | 'p'][] = [
    ['NAÇÃO ADM — cadastro de professores', 'h1'],
    [title, 'p'],
    ['Como preencher', 'h2'],
    ['1. Use a aba "Professores": cada LINHA é uma pessoa (professor, instrutor, estagiário, coordenador).', 'p'],
    ['2. Só o Nome completo é obrigatório. O sistema acha a pessoa pelo nome (ou por um dos "outros nomes").', 'p'],
    ['3. Célula VAZIA = não mexer: o que já está no sistema continua igual. Nada é apagado pela planilha.', 'p'],
    ['4. Várias modalidades ou apelidos: separe com "/" (ex.: CrossFit / HYROX).', 'p'],
    ['5. Datas no formato 01/03/2024. Quem saiu: preencha Desligamento e Ativo = Não.', 'p'],
    ['6. "Outros nomes na planilha": como a pessoa aparece na grade antiga (ex.: Ana (mobility), Aninha). Ajuda a importação da grade a reconhecer.', 'p'],
    ['7. Não mude os títulos da linha 1 da aba "Professores".', 'p'],
    ['Não coloque aqui', 'h2'],
    ['CPF, RG, dados bancários, PIX, salário ou valor-hora. O sistema não guarda esses dados — ficam com o DP/contabilidade.', 'p'],
    ['Como enviar', 'h2'],
    ['Sistema → Professores → Importar planilha → envie este arquivo (.xlsx). Você vê quem será criado e o que muda em cada um antes de confirmar.', 'p'],
  ];
  for (const [text, style] of lines) {
    const row = ins.addRow([text]);
    const c = row.getCell(1);
    c.alignment = { wrapText: true, vertical: 'middle' };
    if (style === 'h1') { c.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; row.height = 30; }
    if (style === 'h2') { c.font = { bold: true, size: 12, color: { argb: NAVY } }; row.height = 24; }
    if (style === 'p') c.font = { size: 11 };
  }

  const ws = wb.addWorksheet('Professores', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }], properties: { tabColor: { argb: NAVY } } });
  const lists = wb.addWorksheet('Listas', { state: 'hidden' });
  const ranges = [cat.positions, cat.contractTypes, cat.modalities, ['Sim', 'Não']].map((values, i) => {
    const letter = String.fromCharCode(65 + i);
    lists.getCell(`${letter}1`).value = ['Cargos', 'Contratos', 'Modalidades', 'Ativo'][i]!;
    values.forEach((v, j) => { lists.getCell(`${letter}${j + 2}`).value = v; });
    return `Listas!$${letter}$2:$${letter}$${Math.max(2, values.length + 1)}`;
  });

  ws.columns = TEACHER_COLUMNS.map((header, i) => ({ header, width: WIDTHS[i] }));
  ws.getRow(1).height = 22;
  ws.getRow(1).eachCell((c, i) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { vertical: 'middle' };
    c.note = HELP[i - 1]!;
  });
  // Datas e telefone como texto: o Excel não transforma "01/03/2024" nem "61 9…".
  for (const col of [4, 10, 11]) ws.getColumn(col).numFmt = '@';

  for (const r of rows) {
    ws.addRow([
      r.name, r.displayName ?? '', r.email ?? '', r.phone ?? '', r.position ?? '', r.contractType ?? '', r.level ?? '',
      r.primaryModality ?? '', r.modalities.join(' / '), br(r.admissionDate), br(r.terminationDate), r.active ? 'Sim' : 'Não',
      r.aliases.join(' / '), r.notes ?? '',
    ]);
  }

  const last = Math.max(MAX_ROWS, rows.length + 100);
  const pick = (formula: string, error: string) => ({
    type: 'list' as const, allowBlank: true, formulae: [formula],
    showErrorMessage: true, errorStyle: 'stop' as const, errorTitle: 'Valor fora da lista', error,
  });
  // A API por intervalo existe no exceljs 4, mas não está nos tipos publicados.
  const validations = (ws as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } }).dataValidations;
  validations.add(`E2:E${last}`, pick(ranges[0]!, 'Escolha um cargo da lista (ou deixe vazio).'));
  validations.add(`F2:F${last}`, pick(ranges[1]!, 'Escolha um contrato da lista (ou deixe vazio).'));
  validations.add(`H2:H${last}`, pick(ranges[2]!, 'Escolha uma modalidade da lista (ou deixe vazio).'));
  validations.add(`L2:L${last}`, pick(ranges[3]!, 'Use Sim ou Não.'));
  ws.autoFilter = { from: 'A1', to: 'N1' };

  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 1, visibility: 'visible' }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
