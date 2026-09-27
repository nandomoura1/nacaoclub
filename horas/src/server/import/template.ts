import ExcelJS from 'exceljs';
import { MODELO_COLUMNS } from '@/domain/import/parsers';

/**
 * Modelo padrão da grade: uma aula por linha, com listas suspensas vindas
 * do cadastro. Em branco (para preencher) ou como espelho da grade atual.
 */
export interface TemplateCatalog {
  modalities: { name: string; area: string }[];
  spaces: string[];
  teachers: string[];
}

export interface TemplateRow {
  area: string;
  modality: string;
  label: string | null;
  weekday: number;
  start: string;
  durationMin: number;
  kind: string;
  space: string | null;
  titular: string[];
  auxiliar: string[];
  estagiario: string[];
}

export const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const TEMPLATE_KINDS = ['Aula', 'Plantão', 'Coordenação', 'Personal'];

const NAVY = 'FF022B57';
const BLUE = 'FF0169E9';
/** Linhas com listas suspensas prontas. */
const MAX_ROWS = 800;

const WIDTHS = [18, 22, 16, 12, 9, 13, 14, 18, 26, 22, 22, 28];
const HELP = [
  'Só referência (preenchida pelo sistema; não é lida)',
  'Obrigatório — escolha na lista',
  'Opcional: Master, Kids, Iniciante…',
  'Obrigatório — Segunda a Domingo',
  'Obrigatório — 07:00',
  'Vazio = duração padrão da modalidade',
  'Vazio = Aula',
  'Opcional — escolha na lista',
  'Nome como no cadastro; 2+ pessoas: Ana / Bia',
  'Opcional — mesmo formato',
  'Opcional — mesmo formato',
  'Livre (não é lida)',
];

export async function buildGradeTemplate(cat: TemplateCatalog, rows: TemplateRow[], title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NAÇÃO | Gestão de Horas';
  wb.created = new Date();

  // ——— Instruções ———
  const ins = wb.addWorksheet('Instruções', { properties: { tabColor: { argb: BLUE } } });
  ins.getColumn(1).width = 110;
  const lines: [string, 'h1' | 'h2' | 'p'][] = [
    ['NAÇÃO | GESTÃO DE HORAS — modelo da grade horária', 'h1'],
    [title, 'p'],
    ['Como preencher', 'h2'],
    ['1. Use a aba "Grade": cada LINHA é uma aula que se repete toda semana.', 'p'],
    ['2. Modalidade, Dia e Início são obrigatórios. Use as listas suspensas (setinha na célula).', 'p'],
    ['3. Início no formato 07:00. Duração em minutos (60, 30, 90); vazio = duração padrão da modalidade.', 'p'],
    ['4. Aula dada por duas pessoas: coloque as duas no Professor titular separadas por "/" (ex.: Ana / Bia). Cada uma recebe a hora cheia.', 'p'],
    ['5. Turma diferencia aulas da mesma modalidade no mesmo horário (ex.: CrossFit "Master" e CrossFit "Iniciante").', 'p'],
    ['6. Tipo: Aula (padrão), Plantão, Coordenação ou Personal (Personal não conta hora — só ocupa o espaço).', 'p'],
    ['7. Professor que ainda não existe no sistema pode ser digitado: a importação oferece cadastrar.', 'p'],
    ['8. Não mude os títulos da linha 1 da aba "Grade". Linhas em branco são ignoradas.', 'p'],
    ['Como enviar', 'h2'],
    ['Sistema → Grade → Importar → envie este arquivo (.xlsx). Você confere a prévia e só então confirma.', 'p'],
    ['Aulas idênticas às que já estão na grade (mesmo dia, hora, modalidade, turma e espaço) são mantidas, não duplicadas.', 'p'],
    ['Para ALTERAR ou ENCERRAR uma aula que já existe, use a tela Grade do sistema: ela guarda o histórico e recalcula o mês.', 'p'],
    ['Exemplo', 'h2'],
    ['CrossFit | Master | Segunda | 06:00 | 60 | Aula | CrossFit 1 | Ana / Bruno', 'p'],
    ['Mobilidade 30 min | | Quarta | 07:00 | 30 | Aula | Sala Tatame | Carla', 'p'],
  ];
  for (const [text, style] of lines) {
    const row = ins.addRow([text]);
    const c = row.getCell(1);
    c.alignment = { wrapText: true, vertical: 'middle' };
    if (style === 'h1') { c.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; row.height = 30; }
    if (style === 'h2') { c.font = { bold: true, size: 12, color: { argb: NAVY } }; row.height = 24; }
    if (style === 'p') c.font = { size: 11 };
  }

  const ws = wb.addWorksheet('Grade', { views: [{ state: 'frozen', ySplit: 1 }], properties: { tabColor: { argb: NAVY } } });

  // ——— Listas (oculta; alimenta as listas suspensas) ———
  const lists = wb.addWorksheet('Listas', { state: 'hidden' });
  const columns: string[][] = [
    cat.modalities.map((m) => m.name),
    WEEKDAYS,
    TEMPLATE_KINDS,
    cat.spaces,
    cat.teachers,
  ];
  const listRange: string[] = [];
  columns.forEach((values, i) => {
    const letter = String.fromCharCode(65 + i);
    lists.getCell(`${letter}1`).value = ['Modalidades', 'Dias', 'Tipos', 'Espaços', 'Professores'][i]!;
    values.forEach((v, j) => { lists.getCell(`${letter}${j + 2}`).value = v; });
    listRange.push(`Listas!$${letter}$2:$${letter}$${Math.max(2, values.length + 1)}`);
  });

  // ——— Grade ———
  ws.columns = MODELO_COLUMNS.map((header, i) => ({ header, width: WIDTHS[i] }));
  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((c, i) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i === 1 || i === 12 ? 'FF5B6B7F' : NAVY } };
    c.alignment = { vertical: 'middle' };
    c.note = HELP[i - 1]!;
  });
  // Texto puro no Início: "07:00" não vira data nem número.
  ws.getColumn(5).numFmt = '@';

  const areaOf = new Map(cat.modalities.map((m) => [m.name, m.area]));
  for (const r of rows) {
    ws.addRow([
      r.area || areaOf.get(r.modality) || '', r.modality, r.label ?? '', WEEKDAYS[r.weekday - 1] ?? '', r.start, r.durationMin,
      r.kind, r.space ?? '', r.titular.join(' / '), r.auxiliar.join(' / '), r.estagiario.join(' / '), '',
    ]);
  }
  const last = Math.max(MAX_ROWS, rows.length + 200);
  // Área é só referência: cinza, para não parecer campo a preencher.
  for (let i = 2; i <= rows.length + 1; i++) ws.getCell(`A${i}`).font = { color: { argb: 'FF5B6B7F' } };
  const strict = (formula: string, prompt: string) => ({
    type: 'list' as const, allowBlank: true, formulae: [formula],
    showErrorMessage: true, errorStyle: 'stop' as const, errorTitle: 'Valor fora da lista', error: prompt,
  });
  const loose = (formula: string) => ({
    type: 'list' as const, allowBlank: true, formulae: [formula],
    // Professor novo pode ser digitado: só avisa.
    showErrorMessage: true, errorStyle: 'information' as const, errorTitle: 'Nome fora do cadastro', error: 'Esse nome não está no cadastro. A importação vai oferecer cadastrar.',
  });
  // A API por intervalo existe no exceljs 4, mas não está nos tipos publicados.
  const validations = (ws as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } }).dataValidations;
  validations.add(`B2:B${last}`, strict(listRange[0]!, 'Escolha uma modalidade da lista.'));
  validations.add(`D2:D${last}`, strict(listRange[1]!, 'Use Segunda, Terça, Quarta, Quinta, Sexta, Sábado ou Domingo.'));
  validations.add(`E2:E${last}`, {
    type: 'custom', allowBlank: true, formulae: ['AND(LEN(E2)=5,MID(E2,3,1)=":")'],
    showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Horário', error: 'Use o formato 07:00.',
  });
  validations.add(`F2:F${last}`, {
    type: 'whole', operator: 'between', allowBlank: true, formulae: [5, 600],
    showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Duração', error: 'Minutos entre 5 e 600 (ex.: 60).',
  });
  validations.add(`G2:G${last}`, strict(listRange[2]!, 'Use Aula, Plantão, Coordenação ou Personal.'));
  validations.add(`H2:H${last}`, strict(listRange[3]!, 'Escolha um espaço da lista (ou deixe vazio).'));
  for (const col of ['I', 'J', 'K']) validations.add(`${col}2:${col}${last}`, loose(listRange[4]!));
  ws.autoFilter = { from: 'A1', to: 'L1' };

  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 1, visibility: 'visible' }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
