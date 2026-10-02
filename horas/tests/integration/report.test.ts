import { beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { createSlots } from '@/server/services/schedule-service';
import { generatePeriod, periodOverview } from '@/server/services/period-service';
import { hoursReport, parseReportFilter, filterToParams } from '@/server/services/report-service';
import { buildReportWorkbook } from '@/server/import/report-xlsx';
import { AppError, AuthorizationError } from '@/server/errors';
import { META, hasDb, makeUser } from './helpers';

/** Competências próprias (2033) para não cruzar com outros testes. */
describe.skipIf(!hasDb)('E7 · relatórios de horas', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let ana: { id: string };
  let bia: { id: string };
  let crossfit: { id: string; areaId: string };
  let futevolei: { id: string; areaId: string };

  beforeAll(async () => {
    await prisma.$transaction((tx) => bootstrapStructure(tx, [2033]), { timeout: 60_000 });
    admin = await makeUser('ADMIN', { name: 'Admin' });
    crossfit = await prisma.modality.findUniqueOrThrow({ where: { name: 'CrossFit' } });
    futevolei = await prisma.modality.findUniqueOrThrow({ where: { name: 'Futevôlei' } });
    const aula = await prisma.activityType.findUniqueOrThrow({ where: { name: 'Aula' } });
    ana = await prisma.teacher.create({ data: { name: 'Ana Relatório' } });
    bia = await prisma.teacher.create({ data: { name: 'Bia Relatório' } });
    const slot = (weekday: number, modalityId: string, teacherId: string, durationMin = 60) => createSlots(admin.principal, {
      weekdays: [weekday], startMin: 1260, durationMin, modalityId, activityTypeId: aula.id, spaceId: '', label: `rel-${weekday}-${durationMin}`,
      people: [{ teacherId, role: 'TITULAR' }], validFrom: '2033-01-01',
    }, META);
    await slot(2, crossfit.id, ana.id);
    await slot(4, futevolei.id, ana.id, 30);
    await slot(4, futevolei.id, bia.id);
    await generatePeriod(admin.principal, { year: 2033, month: 6 }, META);
  });

  it('competência: mesmos números do quadro de horas do fechamento', async () => {
    const f = await parseReportFilter({ competencia: '2033-06' });
    expect(f).toMatchObject({ mode: 'competencia', start: '2033-05-26', end: '2033-06-25' });
    const r = await hoursReport(admin.principal, f);
    const overview = await periodOverview(admin.principal, { year: 2033, month: 6 });
    for (const id of [ana.id, bia.id]) {
      const row = r.byTeacher.find((t) => t.teacherId === id)!;
      const ref = overview.teachers.find((t) => t.teacherId === id)!;
      expect([row.plannedMin, row.totalMin]).toEqual([ref.plannedMin, ref.totalMin]);
    }
    const anaRow = r.byTeacher.find((t) => t.teacherId === ana.id)!;
    expect(anaRow.modalities).toEqual(['CrossFit', 'Futevôlei']);
    expect(r.missing).toEqual([]);
  });

  it('filtros de modalidade, professor e intervalo; competência não gerada é avisada', async () => {
    const byMod = await hoursReport(admin.principal, await parseReportFilter({ competencia: '2033-06', modalidade: futevolei.id }));
    expect(byMod.byModality.map((m) => m.modality)).toEqual(['Futevôlei']);
    expect(byMod.byModality[0]!.teachers).toBeGreaterThanOrEqual(2);

    const byTeacher = await hoursReport(admin.principal, await parseReportFilter({ competencia: '2033-06', professor: bia.id }));
    expect(byTeacher.byTeacher.map((t) => t.teacher)).toEqual(['Bia Relatório']);
    expect(byTeacher.detail.every((d) => d.people.some((p) => p.planned === 'Bia Relatório'))).toBe(true);

    // Uma semana só: 5 a 11/06/2033 (ter 07, qui 09).
    const week = await hoursReport(admin.principal, await parseReportFilter({ modo: 'intervalo', de: '2033-06-05', ate: '2033-06-11', professor: ana.id }));
    expect(week.byTeacher[0]).toMatchObject({ plannedMin: 90, totalMin: 90 });

    const f = await parseReportFilter({ modo: 'intervalo', de: '2033-06-20', ate: '2033-07-10' });
    expect(filterToParams(f)).toBe('modo=intervalo&de=2033-06-20&ate=2033-07-10');
    expect((await hoursReport(admin.principal, f)).missing).toEqual(['Julho/2033']);
  });

  it('coordenador só vê a própria área; sem permissão, nada', async () => {
    const coord = await makeUser('COORDENADOR', { areaIds: [futevolei.areaId] });
    const r = await hoursReport(coord.principal, await parseReportFilter({ competencia: '2033-06' }));
    expect(new Set(r.byModality.map((m) => m.modality))).toEqual(new Set(['Futevôlei']));
    expect(r.labels.scope).toMatch(/áreas que você coordena/);
    await expect(hoursReport(coord.principal, await parseReportFilter({ competencia: '2033-06', area: crossfit.areaId }))).rejects.toThrow(AppError);
    const prof = await makeUser('PROFESSOR'); // sem vínculo com professor: não vê nada
    await expect(hoursReport(prof.principal, await parseReportFilter({}))).rejects.toThrow(/não está vinculado/);
    const consulta = await makeUser('COORDENADOR', { areaIds: [] });
    expect((await hoursReport(consulta.principal, await parseReportFilter({ competencia: '2033-06' }))).byTeacher).toEqual([]);
  });

  it('Excel: quatro abas e total em horas decimais', async () => {
    const r = await hoursReport(admin.principal, await parseReportFilter({ competencia: '2033-06', professor: ana.id }));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(await buildReportWorkbook(r, ['linha 1', 'linha 2'])).buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Por professor', 'Por modalidade', 'Professor x modalidade', 'Aula a aula']);
    const ws = wb.getWorksheet('Por professor')!;
    const header = 5; // título + 2 linhas de informação + linha em branco
    expect(ws.getCell(header, 1).value).toBe('Professor');
    expect(ws.getCell(header + 1, 1).value).toBe('Ana Relatório');
    expect(ws.getCell(header, 11).value).toBe('TOTAL (h)'); // depois do adicional de domingo/feriado
    expect(ws.getCell(header + 1, 11).value).toBeCloseTo(r.byTeacher[0]!.totalMin / 60, 2);
  });
});
