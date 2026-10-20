import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { saveDemand, saveSector } from '@/server/services/proc-service';
import { deleteAta, listAtas, listProcMeetings, saveAta } from '@/server/services/proc-meeting-service';
import { saveTeacher } from '@/server/services/teacher-service';
import { uploadTeacherDoc } from '@/server/services/staff-doc-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Atas de reunião + autonomia do líder (colaboradores, documentos e atestados). */
describe.skipIf(!hasDb)('Atas de reunião e perfil Líder', () => {
  const tag = Math.random().toString(36).slice(2, 7);
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  let outro: Awaited<ReturnType<typeof makeUser>>;
  let mkt: Awaited<ReturnType<typeof makeUser>>;
  let sector = '';
  beforeAll(async () => {
    await ensureCatalog();
    admin = await makeUser('ADMIN'); lider = await makeUser('LIDER', { name: `Lia Líder ${tag}` }); outro = await makeUser('LIDER'); mkt = await makeUser('MARKETING');
    sector = await saveSector(admin.principal, null, { name: `Recepção ${tag}`, description: null, leaderId: lider.principal.id, taskUrl: null, sortOrder: 97, active: true }, META);
  });

  it('ata: líder registra, demandas ficam ligadas, só autor/diretoria edita', async () => {
    const base = { date: '2026-10-20', title: `Alinhamento online ${tag}`, mode: 'ONLINE', participantIds: [admin.principal.id, lider.principal.id], guests: 'Contador', agenda: '1. Escala do feriado\n2. Campanha de verão', decisions: '• Revisar escala até sexta', link: 'https://meet.google.com/abc' };
    await expect(saveAta(mkt.principal, null, base, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(saveAta(lider.principal, null, { ...base, link: 'http://x' }, META)).rejects.toThrow(/https/);
    const id = await saveAta(lider.principal, null, base, META);
    const d = await saveDemand(lider.principal, null, { sectorId: sector, title: 'Revisar escala do feriado', description: null, ownerId: null, dueDate: '2026-10-24', priority: 'MEDIA', meetingId: id }, META);
    expect((await prisma.procDemand.findUniqueOrThrow({ where: { id: d } })).origin).toBe('REUNIAO');

    const ata = (await listAtas(lider.principal)).find((a) => a.id === id)!;
    expect(ata).toMatchObject({ title: base.title, mode: 'ONLINE', guests: 'Contador', canEdit: true });
    expect(ata.participants.map((p) => p.id).sort()).toEqual([admin.principal.id, lider.principal.id].sort());
    expect(ata.demands.map((x) => x.id)).toEqual([d]);
    // Atas não aparecem na lista de reuniões semanais/daily.
    expect((await listProcMeetings(admin.principal)).some((m) => m.id === id)).toBe(false);

    await expect(saveAta(outro.principal, id, base, META)).rejects.toBeInstanceOf(AuthorizationError);
    await saveAta(admin.principal, id, { ...base, decisions: 'Decidido pela diretoria' }, META);
    await expect(deleteAta(lider.principal, id, META)).rejects.toBeInstanceOf(AuthorizationError);
    await deleteAta(admin.principal, id, META);
    expect((await prisma.procDemand.findUniqueOrThrow({ where: { id: d } })).meetingId).toBeNull(); // demanda continua
  });

  it('líder cadastra colaborador e envia atestado (com período)', async () => {
    const tid = await saveTeacher(lider.principal, null, { name: `Novo Colaborador ${tag}`, modalityIds: [], aliases: [] }, META);
    const file = new File([Buffer.from('%PDF-1.4 atestado')], 'atestado.pdf', { type: 'application/pdf' });
    await expect(uploadTeacherDoc(lider.principal, tid, { kind: 'ATESTADO', validFrom: '', validUntil: '', number: '', notes: '' }, file, META)).rejects.toThrow(/período/);
    const doc = await uploadTeacherDoc(lider.principal, tid, { kind: 'ATESTADO', validFrom: '2026-10-19', validUntil: '2026-10-21', number: '', notes: 'Gripe' }, file, META);
    expect((await prisma.teacherDocument.findUniqueOrThrow({ where: { id: doc } })).kind).toBe('ATESTADO');
    await expect(saveTeacher(mkt.principal, null, { name: 'X', modalityIds: [], aliases: [] }, META)).rejects.toBeInstanceOf(AuthorizationError);
  });
});
