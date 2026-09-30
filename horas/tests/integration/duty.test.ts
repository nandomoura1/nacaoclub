import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { toUtc } from '@/domain/dates';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { loadDuty, saveDuty } from '@/server/services/duty-service';
import { hoursReport, parseReportFilter } from '@/server/services/report-service';
import { AppError, AuthorizationError } from '@/server/errors';
import { META, hasDb, makeUser } from './helpers';

// 2034-10-07 é sábado; 08 domingo. Competência 2034-10 = 26/09 a 25/10.
describe.skipIf(!hasDb)('Escalas de fim de semana e feriados', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let academia: { id: string; modality: { areaId: string } };
  let brinq: { id: string; modality: { areaId: string } };

  beforeAll(async () => {
    await prisma.$transaction((tx) => bootstrapStructure(tx, []), { timeout: 60_000 });
    admin = await makeUser('ADMIN', { name: 'Admin' });
    academia = await prisma.dutySector.findUniqueOrThrow({ where: { name: 'Academia' }, include: { modality: true } });
    brinq = await prisma.dutySector.findUniqueOrThrow({ where: { name: 'Brinquedoteca' }, include: { modality: true } });
  });

  it('setores padrão com horários de funcionamento', async () => {
    const d = await loadDuty(admin.principal, '2034-10-07', '2034-10-08');
    expect(d.dates).toEqual(['2034-10-07', '2034-10-08']);
    expect(d.sectors.map((s) => s.name)).toEqual(['Academia', 'CrossFit e HYROX', 'Aulões', 'Futevôlei', 'Brinquedoteca']);
    expect(d.sectors[0]!.defaults).toEqual({ SAB: [[420, 1020]], DOM: [[480, 840]], FERIADO: [[480, 840]] });
  });

  it('salva a escala e as horas entram como extra de quem trabalhou; salvar de novo substitui', async () => {
    const n = Date.now();
    const ana = await prisma.teacher.create({ data: { name: `Ana Escala ${n}` } });
    const bia = await prisma.teacher.create({ data: { name: `Bia Escala ${n}` } });
    const r = await saveDuty(admin.principal, {
      sectorId: academia.id, start: '2034-10-07', end: '2034-10-08',
      shifts: [
        { date: '2034-10-07', startMin: 420, endMin: 720, people: [ana.id, bia.id], notes: 'Manhã' },
        { date: '2034-10-07', startMin: 720, endMin: 1020, people: [bia.id] },
        { date: '2034-10-08', startMin: 480, endMin: 840, people: [] },
      ],
    }, META);
    expect(r).toMatchObject({ shifts: 3, minutes: 300 * 3 });
    expect(r.warnings).toContain('Academia 08/10 08:00–14:00: turno sem ninguém.');

    const rep = async () => hoursReport(admin.principal, await parseReportFilter({ modo: 'intervalo', de: '2034-10-07', ate: '2034-10-08' }));
    let report = await rep();
    expect(report.byTeacher.find((t) => t.teacherId === ana.id)).toMatchObject({ extraMin: 300, totalMin: 300 });
    expect(report.byTeacher.find((t) => t.teacherId === bia.id)).toMatchObject({ extraMin: 600, totalMin: 600 });

    const view = await loadDuty(admin.principal, '2034-10-07', '2034-10-08');
    expect(view.sectors[0]!.shifts.map((s) => [s.startMin, s.people.length, s.notes])).toEqual([[420, 2, 'Manhã'], [720, 1, null], [480, 0, null]]);

    // Reescreve: só a Ana no domingo. As horas antigas saem.
    await saveDuty(admin.principal, { sectorId: academia.id, start: '2034-10-07', end: '2034-10-08', shifts: [{ date: '2034-10-08', startMin: 480, endMin: 840, people: [ana.id] }] }, META);
    report = await rep();
    expect(report.byTeacher.find((t) => t.teacherId === ana.id)).toMatchObject({ extraMin: 360 });
    expect(report.byTeacher.find((t) => t.teacherId === bia.id)).toBeUndefined();
    expect(await prisma.classOccurrence.count({ where: { date: { gte: toUtc('2034-10-07'), lte: toUtc('2034-10-08') }, dutyShiftId: { not: null } } })).toBe(1);
  });

  it('Aulões: escala salva e aparece no relatório de escala, mas não gera horas', async () => {
    const auloes = await prisma.dutySector.findUniqueOrThrow({ where: { name: 'Aulões' } });
    expect(auloes.countsHours).toBe(false);
    const dani = await prisma.teacher.create({ data: { name: `Dani Aulão ${Date.now()}` } });
    const r = await saveDuty(admin.principal, {
      sectorId: auloes.id, start: '2034-10-12', end: '2034-10-12',
      shifts: [{ date: '2034-10-12', startMin: 480, endMin: 600, people: [dani.id], notes: 'Aulão HYROX' }],
    }, META);
    expect(r).toMatchObject({ shifts: 1, minutes: 0, countsHours: false });
    const view = await loadDuty(admin.principal, '2034-10-12', '2034-10-12');
    expect(view.sectors.find((s) => s.name === 'Aulões')!.shifts).toHaveLength(1);
    expect(await prisma.classOccurrence.count({ where: { dutyShift: { sectorId: auloes.id } } })).toBe(0);
    const report = await hoursReport(admin.principal, await parseReportFilter({ modo: 'intervalo', de: '2034-10-12', ate: '2034-10-12' }));
    expect(report.byTeacher.find((t) => t.teacherId === dani.id)).toBeUndefined();

    // Conflito com outro setor continua avisando.
    await saveDuty(admin.principal, { sectorId: academia.id, start: '2034-10-12', end: '2034-10-12', shifts: [{ date: '2034-10-12', startMin: 540, endMin: 840, people: [dani.id] }] }, META);
    const again = await saveDuty(admin.principal, {
      sectorId: auloes.id, start: '2034-10-12', end: '2034-10-12',
      shifts: [{ date: '2034-10-12', startMin: 480, endMin: 600, people: [dani.id] }],
    }, META);
    expect(again.warnings.some((w) => w.includes('dois turnos ao mesmo tempo'))).toBe(true);
  });

  it('avisa quem está em dois setores ao mesmo tempo', async () => {
    const cris = await prisma.teacher.create({ data: { name: `Cris Escala ${Date.now()}` } });
    await saveDuty(admin.principal, { sectorId: academia.id, start: '2034-10-14', end: '2034-10-14', shifts: [{ date: '2034-10-14', startMin: 420, endMin: 720, people: [cris.id] }] }, META);
    const r = await saveDuty(admin.principal, { sectorId: brinq.id, start: '2034-10-14', end: '2034-10-14', shifts: [{ date: '2034-10-14', startMin: 480, endMin: 840, people: [cris.id] }] }, META);
    expect(r.warnings.some((w) => w.includes('dois turnos ao mesmo tempo'))).toBe(true);
  });

  it('valida horário, período e competência fechada', async () => {
    const base = { sectorId: academia.id, start: '2034-10-21', end: '2034-10-22' };
    await expect(saveDuty(admin.principal, { ...base, shifts: [{ date: '2034-10-21', startMin: 600, endMin: 540, people: [] }] }, META)).rejects.toThrow(/término/);
    await expect(saveDuty(admin.principal, { ...base, shifts: [{ date: '2034-10-28', startMin: 480, endMin: 540, people: [] }] }, META)).rejects.toThrow(/fora do período/);
    await expect(saveDuty(admin.principal, { ...base, end: '2035-01-30', shifts: [] }, META)).rejects.toThrow(AppError);

    await saveDuty(admin.principal, { sectorId: academia.id, start: '2034-11-04', end: '2034-11-04', shifts: [{ date: '2034-11-04', startMin: 420, endMin: 600, people: [] }] }, META); // cria a competência
    await prisma.payrollPeriod.update({ where: { year_month: { year: 2034, month: 11 } }, data: { status: 'FECHADO' } });
    await expect(saveDuty(admin.principal, { sectorId: academia.id, start: '2034-11-04', end: '2034-11-04', shifts: [{ date: '2034-11-04', startMin: 420, endMin: 600, people: [] }] }, META)).rejects.toThrow(/fechada/);
  });

  it('coordenador só escala setores da área dele; professor não entra', async () => {
    const coordKids = await makeUser('COORDENADOR', { areaIds: [brinq.modality.areaId] });
    const view = await loadDuty(coordKids.principal, '2034-10-07', '2034-10-08');
    expect(view.sectors.map((s) => s.name)).toEqual(['Brinquedoteca']);
    await expect(saveDuty(coordKids.principal, { sectorId: academia.id, start: '2034-10-07', end: '2034-10-08', shifts: [] }, META)).rejects.toThrow(AuthorizationError);
    const prof = await makeUser('PROFESSOR');
    await expect(loadDuty(prof.principal, '2034-10-07', '2034-10-08')).rejects.toThrow(AuthorizationError);
  });
});
