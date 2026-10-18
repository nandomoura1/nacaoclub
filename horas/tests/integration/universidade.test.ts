import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { fakePut } from '@/server/storage';
import { deleteMaterial, eduLibrary, eduPanel, eduReminder, saveMaterial, saveTrack, setCompleted, startEduUpload } from '@/server/services/edu-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Universidade Nação (armazenamento local STORAGE_FAKE). */
describe.skipIf(!hasDb)('Universidade Nação', () => {
  const prev = process.env.STORAGE_FAKE;
  const tag = Math.random().toString(36).slice(2, 7);
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  let prof: Awaited<ReturnType<typeof makeUser>>;
  let mkt: Awaited<ReturnType<typeof makeUser>>;
  const base = { description: null, category: 'Recepção', format: 'LINK', roleKey: null, version: 'v1', durationMin: 20, active: true, sortOrder: 0 };
  beforeAll(async () => {
    process.env.STORAGE_FAKE = '1';
    await ensureCatalog();
    admin = await makeUser('ADMIN'); lider = await makeUser('LIDER'); prof = await makeUser('PROFESSOR'); mkt = await makeUser('MARKETING');
  });
  afterAll(() => { process.env.STORAGE_FAKE = prev; });

  it('publica (link e arquivo), respeita o público, conclui e acompanha', async () => {
    await expect(saveMaterial(prof.principal, null, { ...base, title: 'X', area: 'TECNICA', url: 'https://x.com', audience: 'TODOS', required: false }, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(saveMaterial(lider.principal, null, { ...base, title: `Sem link ${tag}`, area: 'TECNICA', url: null, audience: 'TODOS', required: false }, META)).rejects.toThrow(/link ou envie/);
    await expect(saveMaterial(lider.principal, null, { ...base, title: `http ${tag}`, area: 'TECNICA', url: 'http://x.com', audience: 'TODOS', required: false }, META)).rejects.toThrow(/https/);

    const manual = await saveMaterial(admin.principal, null, { ...base, title: `Manual do Colaborador ${tag}`, area: 'ESSENCIAL', url: 'https://drive.google.com/manual', audience: 'TODOS', required: true }, META);
    const gestao = await saveMaterial(lider.principal, null, { ...base, title: `Rituais de liderança ${tag}`, area: 'GESTAO', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', format: 'VIDEO', audience: 'LIDERES', required: false }, META);
    // Arquivo: passo 1 (URL assinada) → envio → passo 2 (registro).
    const up = await startEduUpload(admin.principal, { name: 'Checklist de processos.pdf', size: 3 });
    await expect(saveMaterial(admin.principal, null, { ...base, title: `Checklist ${tag}`, area: 'ESSENCIAL', url: null, format: 'PDF', audience: 'TODOS', required: true, file: { path: up.path, fileName: 'Checklist de processos.pdf' } }, META)).rejects.toThrow(/não chegou/);
    await fakePut(up.path, Buffer.from('pdf'));
    const check = await saveMaterial(admin.principal, null, { ...base, title: `Checklist ${tag}`, area: 'ESSENCIAL', url: null, format: 'PDF', audience: 'TODOS', required: true, file: { path: up.path, fileName: 'Checklist de processos.pdf' } }, META);

    // Líder não edita o material da diretoria.
    await expect(saveMaterial(lider.principal, manual, { ...base, title: 'hack', area: 'ESSENCIAL', url: 'https://x.com', audience: 'TODOS', required: true }, META)).rejects.toBeInstanceOf(AuthorizationError);

    // Público: marketing não vê o de líderes; o líder vê.
    const libMkt = await eduLibrary(mkt.principal);
    expect(libMkt.materials.some((m) => m.id === gestao)).toBe(false);
    expect(libMkt.materials.find((m) => m.id === check)!.downloadUrl).toContain('download=');
    expect((await eduLibrary(lider.principal)).materials.some((m) => m.id === gestao)).toBe(true);

    // Trilha (só materiais existentes), progresso e lembrete.
    const track = await saveTrack(admin.principal, null, { name: `Onboarding ${tag}`, description: null, audience: 'TODOS', roleKey: null, active: true, items: [manual, check] }, META);
    expect((await eduReminder(mkt.principal))!.pending).toBeGreaterThanOrEqual(2);
    await setCompleted(mkt.principal, manual, true);
    const t = (await eduLibrary(mkt.principal)).tracks.find((x) => x.id === track)!;
    expect(t.progress).toMatchObject({ total: 2, completed: 1, next: check });
    await setCompleted(mkt.principal, check, true);
    expect((await eduLibrary(mkt.principal)).tracks.find((x) => x.id === track)!.progress.finished).toBe(true);
    await expect(setCompleted(mkt.principal, gestao, true)).rejects.toThrow(/não encontrado/);

    // Painel: só quem publica.
    await expect(eduPanel(mkt.principal)).rejects.toBeInstanceOf(AuthorizationError);
    const panel = await eduPanel(lider.principal);
    const me = panel.people.find((p) => p.id === mkt.principal.id)!;
    expect(me.tracks.find((x) => x.id === track)).toMatchObject({ finished: true });
    expect(panel.materials.find((m) => m.id === manual)!.done).toBe(1);

    await deleteMaterial(admin.principal, check, META);
    expect(await prisma.eduTrackItem.count({ where: { trackId: track } })).toBe(1);
  });
});
