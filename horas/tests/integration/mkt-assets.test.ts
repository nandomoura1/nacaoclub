import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { fakePut, objectSize } from '@/server/storage';
import { deleteAsset, listAssets, registerAsset, setAssetStatus, startAssetUpload } from '@/server/services/mkt-asset-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Biblioteca com armazenamento local (STORAGE_FAKE=1). */
describe.skipIf(!hasDb)('Marketing — Biblioteca', () => {
  const prev = process.env.STORAGE_FAKE;
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let mkt: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    process.env.STORAGE_FAKE = '1';
    await ensureCatalog();
    admin = await makeUser('ADMIN');
    mkt = await makeUser('MARKETING');
    lider = await makeUser('LIDER');
  });
  afterAll(() => { process.env.STORAGE_FAKE = prev; });

  it('envia → registra → aprovação → exclui (arquivo some do armazenamento)', async () => {
    await expect(startAssetUpload(mkt.principal, { name: 'virus.exe', size: 10 })).rejects.toThrow(/Formato/);
    await expect(startAssetUpload(mkt.principal, { name: 'video.mp4', size: 60 * 1024 * 1024 })).rejects.toThrow(/50 MB/);
    await expect(startAssetUpload(lider.principal, { name: 'a.png', size: 10 })).rejects.toBeInstanceOf(AuthorizationError);

    const up = await startAssetUpload(mkt.principal, { name: 'Post Verão.png', size: 4 });
    expect(up.mime).toBe('image/png');
    // Sem o arquivo no armazenamento, não registra.
    await expect(registerAsset(mkt.principal, { path: up.path, fileName: 'Post Verão.png', title: 'Post Verão', kind: 'ARTE', campaignId: null, tags: [], notes: null }, META)).rejects.toThrow(/não chegou/);
    await fakePut(up.path, Buffer.from([1, 2, 3, 4]));
    await expect(registerAsset(mkt.principal, { path: '../../etc/passwd', fileName: 'x.png', title: 'Xis', kind: 'ARTE', campaignId: null, tags: [], notes: null }, META)).rejects.toThrow(/inválido/);
    const id = await registerAsset(mkt.principal, { path: up.path, fileName: 'Post Verão.png', title: 'Post Verão', kind: 'ARTE', campaignId: null, tags: ['Stories', 'stories'], notes: null, sendToReview: true }, META);
    const a = await prisma.mktAsset.findUniqueOrThrow({ where: { id } });
    expect(a).toMatchObject({ status: 'EM_APROVACAO', sizeBytes: 4, tags: ['stories'] });

    const row = (await listAssets(mkt.principal)).find((x) => x.id === id)!;
    expect(row.previewUrl).toContain('/api/dev-storage');
    expect(row.downloadUrl).toContain('download=');

    // Marketing (sem mkt.approve) não aprova; admin aprova; ajustes exige comentário.
    await expect(setAssetStatus(mkt.principal, id, 'APROVADO', null, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(setAssetStatus(admin.principal, id, 'AJUSTES', null, META)).rejects.toThrow(/ajustar/);
    await setAssetStatus(admin.principal, id, 'AJUSTES', 'Logo maior', META);
    await setAssetStatus(mkt.principal, id, 'EM_APROVACAO', null, META);
    await setAssetStatus(admin.principal, id, 'APROVADO', 'Pode publicar', META);
    expect(await prisma.mktAsset.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'APROVADO', reviewNote: 'Pode publicar', reviewedById: admin.principal.id });

    await expect(deleteAsset(mkt.principal, id, META)).rejects.toBeInstanceOf(AuthorizationError);
    await deleteAsset(admin.principal, id, META);
    expect(await objectSize(up.path)).toBeNull();
    expect(await prisma.mktAsset.findUnique({ where: { id } })).toBeNull();
  });
});
