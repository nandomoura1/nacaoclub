import { describe, expect, it } from 'vitest';
import { parseDateBR, parseTeacherSheet, TEACHER_COLUMNS } from '@/domain/import/teachers';
import type { Grid } from '@/domain/import/types';
import { buildTeacherTemplate } from '@/server/import/teacher-template';
import { readWorkbook } from '@/server/import/xlsx';

const grid = (rows: string[][]): Grid => rows.map((r) => r.map((text) => ({ text, slave: false })));
const row = (v: Partial<Record<(typeof TEACHER_COLUMNS)[number], string>>) => TEACHER_COLUMNS.map((c) => v[c] ?? '');

describe('planilha de professores', () => {
  it('datas no formato brasileiro', () => {
    expect(parseDateBR('01/03/2024')).toBe('2024-03-01');
    expect(parseDateBR('1/3/24')).toBe('2024-03-01');
    expect(parseDateBR('2024-03-01')).toBe('2024-03-01');
    expect(parseDateBR('31/02/2024')).toBeNull();
    expect(parseDateBR('março')).toBeNull();
  });

  it('lê uma pessoa por linha; vazio = não mexer (null); avisa o que não dá para ler', () => {
    const parsed = parseTeacherSheet(grid([
      [...TEACHER_COLUMNS],
      row({ 'Nome completo': 'Ana Souza', 'Como aparece na grade': 'Ana', 'E-mail': 'ANA@X.COM', Cargo: 'Professor', 'Outras modalidades': 'CrossFit / HYROX', Admissão: '01/03/2024', Ativo: 'Sim', 'Outros nomes na planilha': 'Ana (mobility); Aninha' }),
      row({ 'Nome completo': 'Bruno Lima' }),
      row({}),
      row({ Cargo: 'Professor' }),
      row({ 'Nome completo': 'ana souza' }),
      row({ 'Nome completo': 'Carla', 'E-mail': 'carla@' }),
      row({ 'Nome completo': 'Davi', Admissão: '32/01/2024' }),
      row({ 'Nome completo': 'Edu', Ativo: 'talvez' }),
      row({ 'Nome completo': 'Fábio', Ativo: 'Não', Desligamento: '2026-08-31' }),
    ]))!;
    expect(parsed.rows.map((r) => r.name)).toEqual(['Ana Souza', 'Bruno Lima', 'Fábio']);
    expect(parsed.rows[0]).toMatchObject({
      line: 2, displayName: 'Ana', email: 'ana@x.com', position: 'Professor', modalities: ['CrossFit', 'HYROX'],
      admissionDate: '2024-03-01', active: true, aliases: ['Ana (mobility)', 'Aninha'],
    });
    expect(parsed.rows[1]).toMatchObject({ email: null, position: null, modalities: null, active: null, aliases: null });
    expect(parsed.rows[2]).toMatchObject({ active: false, terminationDate: '2026-08-31' });
    expect(parsed.warnings).toEqual([
      'linha 5: sem nome — ignorada.',
      'linha 6: "ana souza" repete a linha 2 — ignorada.',
      'linha 7: e-mail "carla@" inválido — Carla ignorado(a).',
      'linha 8: admissão "32/01/2024" inválida — use 01/03/2024.',
      'linha 9: Ativo "talvez" — use Sim ou Não.',
    ]);
  });

  it('aba sem "Nome completo" + "Cargo" não é planilha de professores', () => {
    expect(parseTeacherSheet(grid([['HORARIO', 'SALA', 'SEGUNDA']]))).toBeNull();
  });

  it('espelho: o arquivo gerado volta idêntico', async () => {
    const buf = await buildTeacherTemplate(
      { modalities: ['CrossFit', 'HYROX'], positions: ['Professor'], contractTypes: ['CLT'] },
      [{ name: 'Ana Souza', displayName: 'Ana', email: 'ana@x.com', phone: '61 99999-0000', position: 'Professor', contractType: 'CLT', level: 'II',
        primaryModality: 'CrossFit', modalities: ['HYROX'], admissionDate: '2024-03-01', terminationDate: null, active: true, aliases: ['aninha'], notes: null }],
      'teste',
    );
    const sheets = await readWorkbook(new Uint8Array(buf).buffer);
    expect(sheets.map((s) => s.name)).toEqual(['Instruções', 'Professores', 'Listas']);
    const parsed = parseTeacherSheet(sheets[1]!.grid)!;
    expect(parsed.warnings).toEqual([]);
    expect(parsed.rows).toEqual([{
      line: 2, name: 'Ana Souza', displayName: 'Ana', email: 'ana@x.com', phone: '61 99999-0000', position: 'Professor', contractType: 'CLT', level: 'II',
      primaryModality: 'CrossFit', modalities: ['HYROX'], admissionDate: '2024-03-01', terminationDate: null, active: true, aliases: ['aninha'], notes: null,
    }]);
  });
});
