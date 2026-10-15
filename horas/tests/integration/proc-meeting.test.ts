import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { saveDemand, saveSector, setDemandStatus } from '@/server/services/proc-service';
import { closeProcMeeting, procMeetingView, quickUpdateDemand, setDemandBlocker, setDemandFocus, startProcMeeting } from '@/server/services/proc-meeting-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Reunião de líderes (WhatsApp simulado). */
describe.skipIf(!hasDb)('Gestão de Processos — reunião de líderes', () => {
  const today = '2026-10-15'; // quinta, semana 2026-W42
  const prev = { fake: process.env.ZAPI_FAKE, test: process.env.ZAPI_TEST_PHONE };
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  let outro: Awaited<ReturnType<typeof makeUser>>;
  let sector = '';
  beforeAll(async () => {
    process.env.ZAPI_FAKE = '1'; delete process.env.ZAPI_TEST_PHONE;
    await ensureCatalog();
    admin = await makeUser('ADMIN', { name: 'Diretoria' });
    lider = await makeUser('LIDER', { name: 'Paula Manutenção' });
    outro = await makeUser('LIDER', { name: 'Outro Líder' });
    await prisma.user.update({ where: { id: lider.principal.id }, data: { phone: '61 98888-1234' } });
    sector = await saveSector(admin.principal, null, { name: `Manutenção ${Math.random().toString(36).slice(2, 7)}`, description: null, leaderId: lider.principal.id, taskUrl: null, sortOrder: 95, active: true }, META);
  });
  afterAll(() => { if (prev.fake === undefined) delete process.env.ZAPI_FAKE; else process.env.ZAPI_FAKE = prev.fake; if (prev.test !== undefined) process.env.ZAPI_TEST_PHONE = prev.test; });

  it('semanal: placar, ajustes rápidos, foco e encerramento com WhatsApp', async () => {
    const late = await saveDemand(admin.principal, null, { sectorId: sector, title: 'Trocar lâmpadas da quadra', description: null, ownerId: null, dueDate: '2026-10-10', priority: 'ALTA' }, META);
    const next = await saveDemand(admin.principal, null, { sectorId: sector, title: 'Pintar a arquibancada', description: null, ownerId: null, dueDate: '2026-10-25', priority: 'MEDIA' }, META);

    await expect(startProcMeeting(lider.principal, 'SEMANAL', today, META)).rejects.toBeInstanceOf(AuthorizationError);
    const id = await startProcMeeting(admin.principal, 'SEMANAL', today, META);
    expect(await startProcMeeting(admin.principal, 'SEMANAL', today, META)).toBe(id); // continua a mesma

    // Líder ajusta prazo da atrasada, trava/destrava e coloca no foco; outro líder não mexe.
    await quickUpdateDemand(lider.principal, late, { dueDate: '2026-10-17' }, META);
    await setDemandBlocker(lider.principal, next, 'Esperando a tinta chegar', META);
    await expect(setDemandFocus(outro.principal, next, '2026-W42', META)).rejects.toBeInstanceOf(AuthorizationError);
    await setDemandFocus(lider.principal, late, '2026-W42', META);
    await setDemandFocus(lider.principal, next, '2026-W42', META);
    // Demanda combinada na reunião já nasce no foco.
    const nova = await saveDemand(admin.principal, null, { sectorId: sector, title: 'Orçar gerador', description: null, ownerId: null, dueDate: null, priority: 'MEDIA', meetingId: id, focusWeek: '2026-W42' }, META);
    expect(await prisma.procDemand.findUniqueOrThrow({ where: { id: nova } })).toMatchObject({ origin: 'REUNIAO', meetingId: id, focusWeek: '2026-W42' });
    expect((await prisma.procComment.findFirstOrThrow({ where: { demandId: next } })).body).toContain('Impedimento');

    await setDemandStatus(lider.principal, late, 'CONCLUIDA', META);
    const v = await procMeetingView(admin.principal, id, today);
    const lane = v.lanes.find((l) => l.id === lider.principal.id)!;
    expect(lane.demands.map((d) => d.id)).toEqual(expect.arrayContaining([late, next, nova]));
    expect(v.score.focus).toBeGreaterThanOrEqual(3);
    expect(v.score.focusDone).toBeGreaterThanOrEqual(1);

    await expect(closeProcMeeting(lider.principal, id, null, false, today, META)).rejects.toBeInstanceOf(AuthorizationError);
    const r = await closeProcMeeting(admin.principal, id, 'Comprar tinta em lote', true, today, META);
    expect(r.enviados).toBeGreaterThanOrEqual(1);
    const m = await prisma.procMeeting.findUniqueOrThrow({ where: { id } });
    expect(m.status).toBe('ENCERRADA');
    expect(m.notes).toBe('Comprar tinta em lote');
    await expect(closeProcMeeting(admin.principal, id, null, false, today, META)).rejects.toThrow(/encerrada/);
  });
});
