import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { listNotices, markNoticeRead, noticeBoard, previewNotice, publishNotice, saveNotice } from '@/server/services/mkt-notice-service';
import { handleZapiReceived } from '@/server/whatsapp/inbound';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Comunicação Interna com a Z-API simulada (ZAPI_FAKE). */
describe.skipIf(!hasDb)('Marketing — Comunicação Interna', () => {
  const ENV = ['ZAPI_FAKE', 'ZAPI_TEST_PHONE', 'ZAPI_INSTANCE_ID'] as const;
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  const phone = `619${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const today = '2026-10-14';
  let mkt: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  let roleKey = '';

  beforeAll(async () => {
    process.env.ZAPI_FAKE = '1'; delete process.env.ZAPI_TEST_PHONE; delete process.env.ZAPI_INSTANCE_ID;
    await ensureCatalog();
    mkt = await makeUser('MARKETING');
    lider = await makeUser('LIDER', { name: `Carla Recepção ${randomUUID().slice(0, 4)}` });
    // Um perfil só com a Carla, para o público ser previsível.
    roleKey = `T${randomUUID().slice(0, 6).toUpperCase()}`;
    const role = await prisma.role.create({ data: { key: roleKey, name: `Teste ${roleKey}` } });
    await prisma.userRole.create({ data: { userId: lider.principal.id, roleId: role.id } });
    await prisma.user.update({ where: { id: lider.principal.id }, data: { phone } });
  });
  afterAll(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  it('rascunho → prévia → publica (WhatsApp + OK) → mural com "Li"', async () => {
    const base = { kind: 'URGENTE', title: 'Piscina fechada amanhã', body: 'Oi, {primeiro_nome}! Manutenção na piscina.', audience: 'PERFIL', filter: { roleKey }, campaignId: null, sendWhatsApp: true, askConfirmation: true, pinned: true, showUntil: null };
    await expect(saveNotice(lider.principal, null, base, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(saveNotice(mkt.principal, null, { ...base, filter: {} }, META)).rejects.toThrow(/perfil/);
    const id = await saveNotice(mkt.principal, null, base, META);

    const pv = await previewNotice(mkt.principal, { ...base }, today);
    expect(pv).toMatchObject({ total: 1, comTelefone: 1 });
    expect(pv.texto).toContain('Oi, Carla!');
    expect(pv.texto).toContain('Responda *OK*');

    // Rascunho não aparece no mural.
    expect((await noticeBoard(lider.principal, today)).some((n) => n.id === id)).toBe(false);

    const r = await publishNotice(mkt.principal, id, today, META);
    expect(r).toMatchObject({ total: 1, enviados: 1, falhas: 0 });
    await expect(publishNotice(mkt.principal, id, today, META)).rejects.toThrow(/já foi publicado/);

    // Resposta "ok" no WhatsApp confirma a leitura.
    const out = await handleZapiReceived({ type: 'ReceivedCallback', phone: `55${phone}`, messageId: `m-${randomUUID()}`, text: { message: 'Ok, ciente' } } as never);
    expect(out).toBe('CONFIRMOU');
    const row = (await listNotices(mkt.principal)).find((n) => n.id === id)!;
    expect(row.confirmations).toMatchObject({ total: 1, ok: 1 });

    // Mural: aparece, com o nome da pessoa; "Li" marca.
    const board = await noticeBoard(lider.principal, today);
    const item = board.find((n) => n.id === id)!;
    expect(item).toMatchObject({ read: false, pinned: true });
    expect(item.body).toContain('Oi, Carla!');
    await markNoticeRead(lider.principal, id);
    expect((await noticeBoard(lider.principal, today)).find((n) => n.id === id)?.read).toBe(true);
    expect((await listNotices(mkt.principal)).find((n) => n.id === id)?.reads).toBe(1);
  });
});
