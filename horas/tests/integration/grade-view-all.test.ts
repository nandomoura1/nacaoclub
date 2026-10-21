import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { listGrade } from '@/server/services/schedule-service';
import { gradeViewAreaIds } from '@/server/auth/authz';
import { SYSTEM_ROLES } from '@/server/auth/permissions';
import { hasDb, makeUser } from './helpers';

/** Líder: vê a grade de todas as áreas; editar continua só nas áreas dele. */
describe.skipIf(!hasDb)('Grade: ver todas as áreas', () => {
  beforeAll(async () => { await prisma.$transaction((tx) => bootstrapStructure(tx, []), { timeout: 60_000 }); });
  it('perfil Líder lança aulas, ausências e vê todas as áreas', async () => {
    expect(SYSTEM_ROLES.LIDER.permissions).toEqual(expect.arrayContaining(['schedule.view', 'schedule.view_all', 'schedule.edit', 'occurrence.exception', 'leave.manage', 'teacher.edit']));
    const lider = await makeUser('LIDER');
    const prof = await makeUser('COORDENADOR');
    expect(gradeViewAreaIds(lider.principal)).toBeNull();
    expect(gradeViewAreaIds(prof.principal)).toEqual(prof.principal.areaIds);
    await expect(listGrade(lider.principal, '2026-10-21')).resolves.toBeInstanceOf(Array);
  });
});
