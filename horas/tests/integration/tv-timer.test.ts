import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { commandTimer, listTimerScreens, timerState, tvTimerByToken } from '@/server/services/tv-service';
import { ensureCatalog, hasDb, makeUser } from './helpers';

describe.skipIf(!hasDb)('Cronômetro da TV', () => {
  let screenId: string; let token: string;
  beforeAll(async () => {
    await ensureCatalog();
    const area = await prisma.coordinationArea.create({ data: { name: `Área TV ${randomUUID().slice(0, 6)}` } });
    const m = await prisma.modality.create({ data: { name: `CrossFit TV ${randomUUID().slice(0, 6)}`, areaId: area.id } });
    token = `tv${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    screenId = (await prisma.tvScreen.create({ data: { name: 'TV do box', modalityId: m.id, token } })).id;
  });

  it('professor programa, inicia, pausa e tira o timer; a TV lê pelo link', async () => {
    const prof = await makeUser('PROFESSOR');
    const mkt = await makeUser('MARKETING');
    await expect(commandTimer(mkt.principal, screenId, { type: 'start' })).rejects.toBeInstanceOf(AuthorizationError);
    expect((await listTimerScreens(prof.principal, '2026-11-02')).some((s) => s.id === screenId)).toBe(true);

    expect((await tvTimerByToken(token))!.timer).toBeNull();
    const p = await commandTimer(prof.principal, screenId, { type: 'program', config: { kind: 'AMRAP', durationSec: 99999, label: 'WOD' } });
    expect(p.timer!.config).toMatchObject({ kind: 'AMRAP', durationSec: 3 * 3600, label: 'WOD' });
    await commandTimer(prof.principal, screenId, { type: 'start' });
    await commandTimer(prof.principal, screenId, { type: 'pause' });
    const tv = (await tvTimerByToken(token))!;
    expect(tv.timer).toMatchObject({ full: false });
    expect(tv.timer!.startedAt).not.toBeNull();
    expect(tv.timer!.pausedAt).not.toBeNull();
    await commandTimer(prof.principal, screenId, { type: 'full', on: true });
    expect((await timerState(prof.principal, screenId)).timer!.full).toBe(true);
    await expect(commandTimer(prof.principal, screenId, { type: 'explodir' })).rejects.toThrow(/inválido/);
    await commandTimer(prof.principal, screenId, { type: 'clear' });
    expect((await tvTimerByToken(token))!.timer).toBeNull();
    expect(await tvTimerByToken('nao-existe-0000')).toBeNull();
  });
});
