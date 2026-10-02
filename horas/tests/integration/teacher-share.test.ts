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

  it('mensagem geral por gênero: Musculação × Aulas Coletivas; coordenador só edita o gênero dele', async () => {
    const musc = await prisma.modality.findUniqueOrThrow({ where: { name: 'Musculação' }, select: { id: true, areaId: true } });
    const func = await prisma.modality.findUniqueOrThrow({ where: { name: 'Funcional' }, select: { id: true, areaId: true } });
    const cross = await prisma.modality.findUniqueOrThrow({ where: { name: 'CrossFit' }, select: { id: true, areaId: true } });
    const n = Date.now();
    const a = await prisma.teacher.create({ data: { name: `Ana Share ${n}`, phone: '61 99999-0000', modalities: { create: [{ modalityId: musc.id }] } } });
    const b = await prisma.teacher.create({ data: { name: `Bia Share ${n}`, modalities: { create: [{ modalityId: func.id }, { modalityId: cross.id }] } } });
    const c = await prisma.teacher.create({ data: { name: `Cris Share ${n}`, modalities: { create: [{ modalityId: func.id }, { modalityId: musc.id }] }, primaryModalityId: func.id } });

    await saveGuidelines(admin.principal, a.id, { groups: { musculacao: 'Ronda no salão.' }, specific: 'Abre o salão.' }, META);
    await saveGuidelines(admin.principal, b.id, { groups: { coletivas: 'Chegar 10 min antes.' }, specific: '' }, META);
    const share = (id: string) => teacherShareData(admin.principal, id, '2026-10-05');
    const [da, db, dc] = [await share(a.id), await share(b.id), await share(c.id)];
    expect(da.groups.map((g) => [g.id, g.guidelines])).toEqual([['musculacao', 'Ronda no salão.']]);
    expect(da).toMatchObject({ specific: 'Abre o salão.', phone: '61 99999-0000', canEdit: true });
    expect(db.groups.map((g) => [g.id, g.guidelines])).toEqual([['coletivas', 'Chegar 10 min antes.']]); // Funcional + CrossFit: uma mensagem só
    expect(dc.groups.map((g) => g.id)).toEqual(['coletivas', 'musculacao']); // dá as duas: recebe as duas, a principal primeiro

    const coordColetivas = await makeUser('COORDENADOR', { name: 'Coord Col', areaIds: [cross.areaId] });
    expect((await teacherShareData(coordColetivas.principal, c.id, '2026-10-05')).groups.map((g) => g.canEdit)).toEqual([true, false]);
    await saveGuidelines(coordColetivas.principal, c.id, { groups: { coletivas: 'Novo texto.', musculacao: 'Ronda no salão.' }, specific: '' }, META);
    await expect(saveGuidelines(coordColetivas.principal, c.id, { groups: { musculacao: 'Invasão.' }, specific: '' }, META)).rejects.toThrow(AuthorizationError);

    const consulta = await makeUser('CONSULTA', { name: 'DP' });
    expect((await teacherShareData(consulta.principal, a.id, '2026-10-05')).canEdit).toBe(false);
    await expect(saveGuidelines(consulta.principal, a.id, { groups: {}, specific: '' }, META)).rejects.toThrow(AuthorizationError);
  });

});
