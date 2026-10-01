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

  it('salva gerais (todos) e específicas (do professor), e só quem edita a grade salva', async () => {
    const a = await prisma.teacher.create({ data: { name: `Ana Share ${Date.now()}`, phone: '61 99999-0000' } });
    const b = await prisma.teacher.create({ data: { name: `Bia Share ${Date.now()}` } });
    await saveGuidelines(admin.principal, a.id, { general: 'Conduta\n- Pontualidade.', specific: 'Abre o box.' }, META);
    const da = await teacherShareData(admin.principal, a.id, '2026-10-05');
    const db = await teacherShareData(admin.principal, b.id, '2026-10-05');
    expect(da).toMatchObject({ general: 'Conduta\n- Pontualidade.', specific: 'Abre o box.', phone: '61 99999-0000', canEdit: true });
    expect(db).toMatchObject({ general: 'Conduta\n- Pontualidade.', specific: '' });

    const consulta = await makeUser('CONSULTA', { name: 'DP' });
    expect((await teacherShareData(consulta.principal, a.id, '2026-10-05')).canEdit).toBe(false);
    await expect(saveGuidelines(consulta.principal, a.id, { general: '', specific: '' }, META)).rejects.toThrow(AuthorizationError);
  });
});
