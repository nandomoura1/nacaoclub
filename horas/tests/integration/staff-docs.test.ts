import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { deleteTeacherDoc, getTeacherDocFile, internAlerts, listTeamDocs, teacherDocs, uploadTeacherDoc } from '@/server/services/staff-doc-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Pasta de documentos (nomes e datas fictícios). */
describe.skipIf(!hasDb)('Documentos da equipe', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let internId = '';
  let cltId = '';
  const T = '2026-10-08';
  const pdf = (name: string) => new File([`%PDF fictício ${randomUUID()}`], name, { type: 'application/pdf' });
  const blank = { validFrom: '', validUntil: '', number: '', notes: '' };

  beforeAll(async () => {
    await ensureCatalog();
    admin = await makeUser('ADMIN');
    const est = await prisma.contractType.upsert({ where: { name: 'Estágio' }, create: { name: 'Estágio' }, update: {} });
    const clt = await prisma.contractType.upsert({ where: { name: 'CLT' }, create: { name: 'CLT' }, update: {} });
    internId = (await prisma.teacher.create({ data: { name: `Estagiária Teste ${randomUUID().slice(0, 6)}`, contractTypeId: est.id } })).id;
    cltId = (await prisma.teacher.create({ data: { name: `Professor Teste ${randomUUID().slice(0, 6)}`, contractTypeId: clt.id } })).id;
  });

  it('estagiário sem contrato aparece no alerta; contrato exige início e fim; vencido bloqueia', async () => {
    expect((await internAlerts(admin.principal, T)).find((a) => a.teacherId === internId)?.status.state).toBe('sem_contrato');
    await expect(uploadTeacherDoc(admin.principal, internId, { ...blank, kind: 'CONTRATO_ESTAGIO' }, pdf('termo.pdf'), META)).rejects.toThrow(/início e fim/);
    await expect(uploadTeacherDoc(admin.principal, internId, { ...blank, kind: 'CONTRATO_ESTAGIO', validFrom: '2026-05-01', validUntil: '2026-04-01' }, pdf('termo.pdf'), META)).rejects.toThrow(/anterior/);
    await uploadTeacherDoc(admin.principal, internId, { ...blank, kind: 'CONTRATO_ESTAGIO', validFrom: '2025-10-01', validUntil: '2026-10-01' }, pdf('termo.pdf'), META);
    expect((await internAlerts(admin.principal, T)).find((a) => a.teacherId === internId)?.status).toMatchObject({ state: 'vencido', daysLeft: -7 });
  });

  it('aditivo renova o contador; sai do alerta; auditoria registrada', async () => {
    const id = await uploadTeacherDoc(admin.principal, internId, { ...blank, kind: 'CONTRATO_ESTAGIO', validFrom: '2026-10-02', validUntil: '2027-04-01', notes: '1º aditivo' }, pdf('aditivo.pdf'), META);
    expect((await internAlerts(admin.principal, T)).some((a) => a.teacherId === internId)).toBe(false);
    const v = await teacherDocs(admin.principal, internId, T);
    expect(v.internship).toMatchObject({ state: 'vigente', end: '2027-04-01' });
    expect(v.documents).toHaveLength(2);
    expect(await prisma.auditLog.count({ where: { entityId: internId, action: 'teacher.doc_uploaded' } })).toBe(2);
    expect((await getTeacherDocFile(admin.principal, id)).filename).toBe('aditivo.pdf');
    await deleteTeacherDoc(admin.principal, id, META);
    expect((await teacherDocs(admin.principal, internId, T)).internship?.state).toBe('vencido');
  });

  it('formato e duplicidade; checklist do CLT no painel', async () => {
    await expect(uploadTeacherDoc(admin.principal, cltId, { ...blank, kind: 'IDENTIDADE' }, new File(['x'], 'rg.exe'), META)).rejects.toThrow(/PDF ou foto/);
    const f = pdf('rg.pdf');
    await uploadTeacherDoc(admin.principal, cltId, { ...blank, kind: 'IDENTIDADE' }, f, META);
    await expect(uploadTeacherDoc(admin.principal, cltId, { ...blank, kind: 'IDENTIDADE' }, f, META)).rejects.toThrow(/já está na pasta/);
    const row = (await listTeamDocs(admin.principal, T)).find((r) => r.id === cltId)!;
    expect(row.checklist.map((c) => c.state)).toEqual(['ok', 'faltando', 'faltando']);
    expect(row.internship).toBeNull();
  });

  it('permissões: coordenador vê o alerta mas não a pasta; professor não vê nada', async () => {
    const coord = await makeUser('COORDENADOR');
    expect((await internAlerts(coord.principal, T)).some((a) => a.teacherId === internId)).toBe(true);
    await expect(teacherDocs(coord.principal, internId, T)).rejects.toBeInstanceOf(AuthorizationError);
    const prof = await makeUser('PROFESSOR');
    expect(await internAlerts(prof.principal, T)).toEqual([]);
    await expect(listTeamDocs(prof.principal, T)).rejects.toBeInstanceOf(AuthorizationError);
  });
});
