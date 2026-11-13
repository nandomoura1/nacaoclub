import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { createSlots, listGrade, changeSlot } from '@/server/services/schedule-service';
import { applySimulation, createSimulation, discardSimulation, getSimulation, listSimulations, saveSimulation, simulationGrade } from '@/server/services/grade-sim-service';
import { replaceTeacher, type SimItem } from '@/domain/grade-sim';
import { META, hasDb, makeUser } from './helpers';

/** Datas de 2047 (próprias deste arquivo), numa área só deste teste. */
describe.skipIf(!hasDb)('Simulação de grade', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let areaId: string, modalityId: string, aulaId: string;
  let ana: { id: string }, bia: { id: string }, caio: { id: string };
  const tag = randomUUID().slice(0, 6);

  beforeAll(async () => {
    await prisma.$transaction((tx) => bootstrapStructure(tx, []), { timeout: 60_000 });
    admin = await makeUser('ADMIN');
    areaId = (await prisma.coordinationArea.create({ data: { name: `Área Sim ${tag}` } })).id;
    modalityId = (await prisma.modality.create({ data: { name: `Modalidade Sim ${tag}`, areaId } })).id;
    aulaId = (await prisma.activityType.findUniqueOrThrow({ where: { name: 'Aula' } })).id;
    const mk = (n: string) => prisma.teacher.create({ data: { name: `${n} Sim ${tag}` } });
    ana = await mk('Ana'); bia = await mk('Bia'); caio = await mk('Caio');
    for (const [weekday, startMin, who] of [[1, 420, ana.id], [3, 420, ana.id], [5, 1080, bia.id]] as const) {
      await createSlots(admin.principal, { weekdays: [weekday], startMin, durationMin: 60, modalityId, activityTypeId: aulaId, spaceId: '', label: null, people: [{ teacherId: who, role: 'TITULAR' }], validFrom: '2047-01-01' }, META);
    }
  });

  const gradeAt = async (d: string) => (await listGrade(admin.principal, d, areaId)).map((g) => `${g.weekday}@${g.startMin}+${g.durationMin}:${g.people.map((p) => p.name.split(' ')[0]).join('/')}`).sort();

  it('simula, compara e implanta a partir de uma data (o passado não muda)', async () => {
    const lider = await makeUser('MARKETING');
    await expect(createSimulation(lider.principal, { name: 'x', areaId, baseDate: '2047-02-01' }, META)).rejects.toBeInstanceOf(AuthorizationError);

    const id = await createSimulation(admin.principal, { name: `Verão ${tag}`, areaId, baseDate: '2047-02-01' }, META);
    const v = await getSimulation(admin.principal, id);
    expect(v.items).toHaveLength(3);
    expect((await listSimulations(admin.principal)).find((s) => s.id === id)).toMatchObject({ status: 'RASCUNHO', items: 3 });

    // Ana sai, Caio entra no lugar dela; aula de sexta passa a 90 min; nova aula de sábado; quarta sai.
    let items: SimItem[] = replaceTeacher(v.items, ana.id, caio.id).items;
    items = items.map((i) => (i.weekday === 5 ? { ...i, durationMin: 90 } : i.weekday === 3 ? { ...i, removed: true } : i));
    items.push({ key: 'n-1', slotId: null, baseVersionId: null, weekday: 6, startMin: 540, durationMin: 60, modalityId, activityTypeId: aulaId, spaceId: null, label: 'Nova', people: [{ teacherId: bia.id, role: 'TITULAR' }] });
    await saveSimulation(admin.principal, id, { name: `Verão ${tag}`, effectiveFrom: '2047-03-04', items }, META);
    // Imprimir/WhatsApp: a grade que a simulação produz, com nomes (sem tocar na grade real).
    const sg = await simulationGrade(admin.principal, id);
    expect(sg.sim.effectiveFrom).toBe('2047-03-04');
    expect(sg.grade.map((g) => `${g.weekday}@${g.startMin}+${g.durationMin}:${g.people.map((p) => p.name.split(' ')[0]).join(',')}`)).toEqual(['1@420+60:Caio', '5@1080+90:Bia', '6@540+60:Bia']);
    expect(sg.grade[0]!.modality.areaId).toBe(areaId);
    // Nada muda na grade real só por salvar.
    expect(await gradeAt('2047-03-10')).toEqual(['1@420+60:Ana', '3@420+60:Ana', '5@1080+60:Bia']);

    // Alguém mexe na grade real depois da simulação: implantar pede confirmação.
    const seg = (await listGrade(admin.principal, '2047-02-15', areaId)).find((g) => g.weekday === 1)!;
    await changeSlot(admin.principal, seg.slotId, { weekday: 1, startMin: 450, durationMin: 60, modalityId, activityTypeId: aulaId, spaceId: '', label: null, people: [{ teacherId: ana.id, role: 'TITULAR' }], from: '2047-02-15' }, META);
    await expect(applySimulation(admin.principal, id, { from: '2047-03-04' }, META)).rejects.toThrow(/mudaram na grade depois da simulação/);
    await expect(applySimulation(admin.principal, id, { from: '2020-01-01', acceptConflicts: true }, META)).rejects.toThrow(/hoje ou uma data futura/);

    const r = await applySimulation(admin.principal, id, { from: '2047-03-04', acceptConflicts: true }, META);
    expect(r).toEqual({ alteradas: 2, encerradas: 1, criadas: 1, conflitos: 1 });
    expect(await gradeAt('2047-03-10')).toEqual(['1@420+60:Caio', '5@1080+90:Bia', '6@540+60:Bia']);
    // Antes da data, a grade continua como era (com a mudança feita à mão em 15/02).
    expect(await gradeAt('2047-03-01')).toEqual(['1@450+60:Ana', '3@420+60:Ana', '5@1080+60:Bia']);
    const done = await getSimulation(admin.principal, id);
    expect(done.status).toBe('IMPLANTADA');
    // Implantada: compara a véspera (Ana, 3 aulas) com a grade real a partir da data (Caio, Bia).
    expect(done.current.map((i) => i.weekday).sort()).toEqual([1, 3, 5]);
    expect(done.items.map((i) => i.weekday).sort()).toEqual([1, 5, 6]);
    await expect(saveSimulation(admin.principal, id, { name: 'x x', effectiveFrom: '2047-04-01', items }, META)).rejects.toThrow(/já implantada/);
    const log = await prisma.auditLog.findFirst({ where: { entityId: id, action: 'grade.simulation_applied' } });
    expect(log!.summary).toMatch(/2 alterada\(s\), 1 criada\(s\), 1 encerrada\(s\)/);
  });

  it('descartar; simulação igual à grade não implanta nada', async () => {
    const id = await createSimulation(admin.principal, { name: `Igual ${tag}`, areaId, baseDate: '2047-03-10' }, META);
    await expect(applySimulation(admin.principal, id, { from: '2047-04-01' }, META)).rejects.toThrow(/nada para implantar/);
    await discardSimulation(admin.principal, id, META);
    expect((await getSimulation(admin.principal, id)).status).toBe('DESCARTADA');
  });
});
