import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { fakePut } from '@/server/storage';
import { addAtaFile, ataFileUrl, deleteAta, deleteAtaFile, listAtas, saveAta, startAtaUpload } from '@/server/services/proc-meeting-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Arquivos das atas (armazenamento local STORAGE_FAKE). */
describe.skipIf(!hasDb)('Atas de reunião · arquivos', () => {
  const prev = process.env.STORAGE_FAKE;
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  let outro: Awaited<ReturnType<typeof makeUser>>;
  let prof: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    process.env.STORAGE_FAKE = '1';
    await ensureCatalog();
    admin = await makeUser('ADMIN'); lider = await makeUser('LIDER'); outro = await makeUser('LIDER'); prof = await makeUser('PROFESSOR');
  });
  afterAll(() => { process.env.STORAGE_FAKE = prev; });

  it('participante anexa proposta; quem vê as atas baixa; só quem anexou ou a diretoria exclui', async () => {
    const ata = await saveAta(admin.principal, null, { date: '2026-11-19', title: 'Proposta de eventos 2027', mode: 'ONLINE', participantIds: [lider.principal.id], guests: null, agenda: 'Apresentação das propostas', decisions: null, link: null }, META);

    await expect(startAtaUpload(outro.principal, ata, { name: 'x.pdf', size: 3 })).rejects.toBeInstanceOf(AuthorizationError); // não participou
    await expect(startAtaUpload(prof.principal, ata, { name: 'x.pdf', size: 3 })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(startAtaUpload(lider.principal, ata, { name: 'pagina.html', size: 3 })).rejects.toThrow(/Formato não aceito/);

    const up = await startAtaUpload(lider.principal, ata, { name: 'Proposta Eventos 2027.pdf', size: 3 });
    await expect(addAtaFile(lider.principal, ata, { path: up.path, fileName: 'Proposta Eventos 2027.pdf', kind: 'PROPOSTA' }, META)).rejects.toThrow(/não chegou/);
    await fakePut(up.path, Buffer.from('pdf'));
    const fileId = await addAtaFile(lider.principal, ata, { path: up.path, fileName: 'Proposta Eventos 2027.pdf', kind: 'PROPOSTA' }, META);

    const row = (await listAtas(outro.principal)).find((a) => a.id === ata)!;
    expect(row.files).toMatchObject([{ id: fileId, kind: 'PROPOSTA', fileName: 'Proposta Eventos 2027.pdf', sizeBytes: 3, canDelete: false }]);
    expect(row.canAttach).toBe(false);
    expect(await ataFileUrl(outro.principal, fileId)).toContain('download=Proposta');
    await expect(ataFileUrl(prof.principal, fileId)).rejects.toBeInstanceOf(AuthorizationError);

    await expect(deleteAtaFile(outro.principal, fileId, META)).rejects.toBeInstanceOf(AuthorizationError);
    await deleteAtaFile(lider.principal, fileId, META);
    expect(await prisma.procMeetingFile.count({ where: { meetingId: ata } })).toBe(0);

    // Excluir a ata leva os arquivos junto.
    const up2 = await startAtaUpload(admin.principal, ata, { name: 'Projeto.docx', size: 4 });
    await fakePut(up2.path, Buffer.from('docx'));
    await addAtaFile(admin.principal, ata, { path: up2.path, fileName: 'Projeto.docx', kind: 'PROJETO' }, META);
    await deleteAta(admin.principal, ata, META);
    expect(await prisma.procMeetingFile.count({ where: { meetingId: ata } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: ata, action: { startsWith: 'proc.ata_file' } } })).toBe(3);
  });
});
