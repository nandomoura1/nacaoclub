import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { createWeek, saveWeek } from '@/server/services/workout-service';
import { listScreens, pinScreen, rotateScreenToken, saveScreen, tvByToken, tvByWeek } from '@/server/services/tv-service';
import { AuthorizationError } from '@/server/errors';
import { META, hasDb, makeUser } from './helpers';

/** Telas de TV do box: link sem login, treino do dia, dia fixado. */
describe.skipIf(!hasDb)('Treino na TV', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let prof: Awaited<ReturnType<typeof makeUser>>;
  let hyrox = '';
  let weekId = '';
  beforeAll(async () => {
    await prisma.$transaction((tx) => bootstrapStructure(tx, []), { timeout: 60_000 });
    admin = await makeUser('ADMIN'); prof = await makeUser('PROFESSOR');
    hyrox = (await prisma.modality.findUniqueOrThrow({ where: { name: 'HYROX' } })).id;
    weekId = await createWeek(admin.principal, { modalityId: hyrox, date: '2041-03-04' }, META); // semana de 04/03/2041
    await saveWeek(admin.principal, weekId, {
      theme: 'Ritmo', days: [
        { date: '2041-03-04', title: 'Simulado', blocks: [{ kind: 'AQUECIMENTO', durationMin: 10, content: 'Trote' }, { kind: 'WOD', title: 'Estações', format: 'For time', durationMin: 30, content: '1 km run\n50 wall balls', coachNotes: 'Cuidar da técnica' }] },
        { date: '2041-03-06', blocks: [{ kind: 'FORCA', title: 'Sled', durationMin: 20, content: '6x20 m' }] },
      ],
    }, META);
  });

  it('cria a tela, mostra o treino do dia sem login (versão do aluno) e o próximo quando não há treino', async () => {
    await expect(saveScreen(prof.principal, null, { name: 'TV', modalityId: hyrox }, META)).rejects.toBeInstanceOf(AuthorizationError);
    const id = await saveScreen(admin.principal, null, { name: 'TV do Hyrox', modalityId: hyrox }, META);
    const s = (await listScreens(admin.principal)).find((x) => x.id === id)!;
    expect(s.token).toMatch(/^[a-hjkmnp-z2-9]{10}$/);
    const v = (await tvByToken(s.token, '2041-03-04'))!;
    expect(v).toMatchObject({ modality: 'HYROX', date: '2041-03-04', pinned: false, title: 'Simulado', theme: 'Ritmo', next: null });
    expect(v.blocks.map((b) => b.kind)).toEqual(['AQUECIMENTO', 'WOD']);
    expect(v.blocks.every((b) => b.coachNotes === null)).toBe(true);
    expect((await prisma.tvScreen.findUniqueOrThrow({ where: { id } })).lastSeenAt).not.toBeNull();
    const empty = (await tvByToken(s.token, '2041-03-05'))!;
    expect(empty.blocks).toEqual([]);
    expect(empty.next).toBe('2041-03-06');
    expect(await tvByToken('naoexiste12', '2041-03-04')).toBeNull();
  });

  it('fixa um dia (até ele passar), troca o link e abre o dia da semana com login', async () => {
    const s = (await listScreens(admin.principal)).find((x) => x.name === 'TV do Hyrox')!;
    await expect(pinScreen(admin.principal, s.id, '2041-03-03', '2041-03-04', META)).rejects.toThrow(/à frente/);
    await pinScreen(admin.principal, s.id, '2041-03-06', '2041-03-04', META);
    expect((await tvByToken(s.token, '2041-03-04'))!).toMatchObject({ date: '2041-03-06', pinned: true });
    expect((await tvByToken(s.token, '2041-03-07'))!).toMatchObject({ date: '2041-03-07', pinned: false });
    await rotateScreenToken(admin.principal, s.id, META);
    expect(await tvByToken(s.token, '2041-03-04')).toBeNull();
    const w = await tvByWeek(prof.principal, weekId, '2041-03-04');
    expect(w.blocks[1]).toMatchObject({ title: 'Estações', coachNotes: null });
    await expect(tvByWeek(prof.principal, weekId, '2041-03-05')).rejects.toThrow(/não tem treino/);
  });
});
