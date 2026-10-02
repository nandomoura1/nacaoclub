import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { saveGuidelines, teacherShareData } from '@/server/services/teacher-share-service';
import { AuthorizationError } from '@/server/errors';
import { META, hasDb, makeUser } from './helpers';

describe.skipIf(!hasDb)('grade do professor no WhatsApp: orientações', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  beforeAll(async () => {
    await prisma.$transaction((tx) => bootstrapStructure(tx, [2026]), { timeout: 60_000 });
    admin = await makeUser('ADMIN', { name: 'Admin' });
  });

  it('orientações por área: Musculação e Coletivas separadas; coordenador só edita a própria área', async () => {
    const musc = await prisma.modality.findUniqueOrThrow({ where: { name: 'Musculação' }, select: { id: true, areaId: true } });
    const func = await prisma.modality.findUniqueOrThrow({ where: { name: 'Funcional' }, select: { id: true, areaId: true } });
    expect(musc.areaId).not.toBe(func.areaId);
    const n = Date.now();
    const a = await prisma.teacher.create({ data: { name: `Ana Share ${n}`, phone: '61 99999-0000', modalities: { create: [{ modalityId: musc.id }] } } });
    const b = await prisma.teacher.create({ data: { name: `Bia Share ${n}`, modalities: { create: [{ modalityId: func.id }, { modalityId: musc.id }] }, primaryModalityId: func.id } });

    await saveGuidelines(admin.principal, a.id, { areas: { [musc.areaId]: 'Ronda no salão.' }, specific: 'Abre o salão.' }, META);
    await saveGuidelines(admin.principal, b.id, { areas: { [func.areaId]: 'Chegar 10 min antes.' }, specific: '' }, META);
    const da = await teacherShareData(admin.principal, a.id, '2026-10-05');
    const db = await teacherShareData(admin.principal, b.id, '2026-10-05');
    expect(da.areas.map((x) => [x.id, x.guidelines])).toEqual([[musc.areaId, 'Ronda no salão.']]);
    expect(da).toMatchObject({ specific: 'Abre o salão.', phone: '61 99999-0000', canEdit: true });
    expect(db.areas.map((x) => x.id)).toEqual([func.areaId, musc.areaId]); // principal primeiro; recebe as duas
    expect(db.areas.map((x) => x.guidelines)).toEqual(['Chegar 10 min antes.', 'Ronda no salão.']);

    const coordColetivas = await makeUser('COORDENADOR', { name: 'Coord Col', areaIds: [func.areaId] });
    const view = await teacherShareData(coordColetivas.principal, b.id, '2026-10-05');
    expect(view.areas.map((x) => x.canEdit)).toEqual([true, false]);
    await saveGuidelines(coordColetivas.principal, b.id, { areas: { [func.areaId]: 'Novo texto.', [musc.areaId]: 'Ronda no salão.' }, specific: '' }, META);
    await expect(saveGuidelines(coordColetivas.principal, b.id, { areas: { [musc.areaId]: 'Invasão.' }, specific: '' }, META)).rejects.toThrow(AuthorizationError);

    const consulta = await makeUser('CONSULTA', { name: 'DP' });
    expect((await teacherShareData(consulta.principal, a.id, '2026-10-05')).canEdit).toBe(false);
    await expect(saveGuidelines(consulta.principal, a.id, { areas: {}, specific: '' }, META)).rejects.toThrow(AuthorizationError);
  });
});
