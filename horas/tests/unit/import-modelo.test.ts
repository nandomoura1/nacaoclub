import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseSheet } from '@/domain/import/parsers';
import { buildPlan, collectNames, type ImportCatalog } from '@/domain/import/plan';
import type { Grid } from '@/domain/import/types';
import { buildGradeTemplate } from '@/server/import/template';
import { readWorkbook } from '@/server/import/xlsx';

function grid(rows: string[][]): Grid {
  return rows.map((r) => r.map((text) => ({ text, slave: false })));
}

const HEADER = ['Área', 'Modalidade', 'Turma', 'Dia', 'Início', 'Duração (min)', 'Tipo', 'Espaço', 'Professor titular', 'Auxiliar', 'Estagiário', 'Observação'];

const CAT: ImportCatalog = {
  modalities: [
    { id: 'm-cf', name: 'CrossFit', defaultDurationMin: 60 },
    { id: 'm-mob', name: 'Mobilidade 30 min', defaultDurationMin: 30 },
    { id: 'm-fut', name: 'Futevôlei', defaultDurationMin: 60 },
  ],
  spaces: [{ id: 's-cf1', name: 'CrossFit 1' }],
  activityTypes: [{ id: 't-aula', kind: 'AULA' }, { id: 't-plantao', kind: 'PLANTAO' }, { id: 't-coord', kind: 'COORDENACAO' }],
  teachers: [{ id: 't-ana', name: 'Ana Souza', displayName: 'Ana', aliases: [] }],
};

describe('layout MODELO (modelo padrão)', () => {
  const sheet = grid([
    HEADER,
    ['CrossFit', 'CrossFit', 'Master', 'Segunda', '06:00', '', 'Aula', 'CrossFit 1', 'Ana Souza / Bruno', 'Carla', '', 'obs livre'],
    ['', 'Mobilidade 30 min', '', 'quarta-feira', '07:00:00', '30', '', '', 'Ana Souza', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', ''],
    ['', 'Futevôlei', '', 'Sábado', '8:30', '', 'Coordenação', '', 'Ramon', '', '', ''],
    ['', 'CrossFit', '', 'Dia errado', '06:00', '', '', '', 'Ana Souza', '', '', ''],
    ['', 'CrossFit', '', 'Terça', '25:00', '', '', '', 'Ana Souza', '', '', ''],
  ]);
  const parsed = parseSheet('Grade', sheet);

  it('reconhece o modelo e lê uma aula por linha, ignorando linhas vazias', () => {
    expect(parsed.layout).toBe('MODELO');
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.warnings).toHaveLength(2);
    expect(parsed.warnings[0]).toMatch(/linha 6.*Dia errado/);
    expect(parsed.warnings[1]).toMatch(/linha 7.*25:00/);
  });

  it('lê dia, hora, duração, tipo, turma e pessoas por papel', () => {
    const [cf, mob, coord] = parsed.rows;
    expect(cf).toMatchObject({ weekday: 1, startMin: 360, durationMin: null, kind: 'AULA', labelHint: 'Master', spaceHint: 'CrossFit 1', ref: 'B2' });
    expect(cf!.people).toEqual([{ raw: 'Ana Souza', role: 'TITULAR' }, { raw: 'Bruno', role: 'TITULAR' }, { raw: 'Carla', role: 'AUXILIAR' }]);
    expect(mob).toMatchObject({ weekday: 3, startMin: 420, durationMin: 30, labelHint: null });
    expect(coord).toMatchObject({ weekday: 6, startMin: 510, kind: 'COORDENACAO' });
  });

  it('gera o plano com modalidade exata, turma e espaço do modelo', () => {
    const decisions = Object.fromEntries(collectNames(parsed.rows, CAT).map((n) => [n.key, n.auto]));
    const plan = buildPlan(parsed.rows, CAT, {}, decisions);
    expect(plan.unresolvedKeys).toEqual([]);
    const cf = plan.slots.find((s) => s.modalityId === 'm-cf')!;
    expect(cf).toMatchObject({ label: 'Master', spaceId: 's-cf1', durationMin: 60, activityTypeId: 't-aula' });
    expect(cf.people.map((p) => p.ref)).toEqual(['t-ana', 'new:bruno', 'new:carla']);
    expect(plan.slots.find((s) => s.modalityId === 'm-mob')).toMatchObject({ durationMin: 30, label: null });
    expect(plan.slots.find((s) => s.modalityId === 'm-fut')).toMatchObject({ activityTypeId: 't-coord' });
  });
});

describe('arquivo do modelo (.xlsx)', () => {
  const cat = { modalities: [{ name: 'CrossFit', area: 'CrossFit' }, { name: 'Mobilidade 30 min', area: 'CrossFit' }], spaces: ['CrossFit 1'], teachers: ['Ana Souza'] };
  const rows = [
    { area: 'CrossFit', modality: 'CrossFit', label: 'Master', weekday: 1, start: '06:00', durationMin: 60, kind: 'Aula', space: 'CrossFit 1', titular: ['Ana Souza', 'Bruno'], auxiliar: [], estagiario: ['Duda'] },
    { area: 'CrossFit', modality: 'Mobilidade 30 min', label: null, weekday: 7, start: '09:30', durationMin: 30, kind: 'Plantão', space: null, titular: ['Ana Souza'], auxiliar: [], estagiario: [] },
  ];

  it('espelho: o que sai do sistema volta idêntico na importação', async () => {
    const buf = await buildGradeTemplate(cat, rows, 'teste');
    const sheets = await readWorkbook(new Uint8Array(buf).buffer);
    expect(sheets.map((s) => s.name)).toEqual(['Instruções', 'Grade', 'Listas']);
    const parsed = sheets.map((s) => parseSheet(s.name, s.grid));
    expect(parsed.map((p) => p.layout)).toEqual([null, 'MODELO', null]);
    const grade = parsed[1]!;
    expect(grade.warnings).toEqual([]);
    expect(grade.rows.map((r) => [r.activityText, r.labelHint, r.weekday, r.startMin, r.durationMin, r.kind, r.spaceHint, r.people.map((p) => `${p.role}:${p.raw}`)])).toEqual([
      ['CrossFit', 'Master', 1, 360, 60, 'AULA', 'CrossFit 1', ['TITULAR:Ana Souza', 'TITULAR:Bruno', 'ESTAGIARIO:Duda']],
      ['Mobilidade 30 min', null, 7, 570, 30, 'PLANTAO', null, ['TITULAR:Ana Souza']],
    ]);
  });

  it('tem listas suspensas, Listas oculta e Grade ativa', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildGradeTemplate(cat, [], 'teste'));
    expect(wb.getWorksheet('Listas')!.state).toBe('hidden');
    const grade = wb.getWorksheet('Grade')!;
    expect(grade.getCell('B2').dataValidation).toMatchObject({ type: 'list', formulae: ['Listas!$A$2:$A$3'] });
    expect(grade.getCell('D500').dataValidation).toMatchObject({ type: 'list' });
    expect(grade.getCell('I2').dataValidation).toMatchObject({ type: 'list', errorStyle: 'information' });
  });

  it('hora digitada como hora no Excel é lida como 07:00', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Grade');
    ws.addRow(['Modalidade', 'Dia', 'Início']);
    ws.addRow(['CrossFit', 'Segunda', new Date(Date.UTC(1899, 11, 30, 7, 0))]);
    ws.addRow(['CrossFit', 'Terça', 0.3125]);
    ws.getCell('C3').numFmt = 'hh:mm';
    const [sheet] = await readWorkbook(new Uint8Array(await wb.xlsx.writeBuffer()).buffer);
    const parsed = parseSheet('Grade', sheet!.grid);
    expect(parsed.rows.map((r) => r.startMin)).toEqual([420, 450]);
  });
});
