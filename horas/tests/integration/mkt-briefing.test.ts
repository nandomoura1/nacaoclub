import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { saveCampaign } from '@/server/services/marketing-service';
import { briefingData, sendBriefing } from '@/server/services/mkt-briefing-service';
import { previewNotice } from '@/server/services/mkt-notice-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Briefing da campanha com a Z-API simulada (ZAPI_FAKE). */
describe.skipIf(!hasDb)('Marketing — Briefing da campanha', () => {
  const ENV = ['ZAPI_FAKE', 'ZAPI_TEST_PHONE', 'ZAPI_INSTANCE_ID'] as const;
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  const tag = randomUUID().slice(0, 5);
  const phone = (n: number) => `619${String(Math.floor(Math.random() * 1e7) * 10 + n).padStart(8, '0')}`;
  let mkt: Awaited<ReturnType<typeof makeUser>>;
  let vendas: Awaited<ReturnType<typeof makeUser>>;
  let roleKey = '';
  let campaignId = '';

  beforeAll(async () => {
    process.env.ZAPI_FAKE = '1'; delete process.env.ZAPI_TEST_PHONE; delete process.env.ZAPI_INSTANCE_ID;
    await ensureCatalog();
    mkt = await makeUser('MARKETING', { name: `Ana Mkt ${tag}` });
    vendas = await makeUser('LIDER', { name: `Bruno Comercial ${tag}` });
    await prisma.user.update({ where: { id: mkt.principal.id }, data: { phone: phone(1) } });
    await prisma.user.update({ where: { id: vendas.principal.id }, data: { phone: phone(2) } });
    roleKey = `C${randomUUID().slice(0, 6).toUpperCase()}`;
    const role = await prisma.role.create({ data: { key: roleKey, name: `Comercial ${roleKey}` } });
    await prisma.userRole.create({ data: { userId: vendas.principal.id, roleId: role.id } });
    campaignId = await saveCampaign(mkt.principal, null, { name: `Aulão ${tag}`, type: 'VENDAS', offer: '10% off', cta: 'Chama no WhatsApp', startDate: '2026-11-02', ownerId: mkt.principal.id, leadOwnerId: vendas.principal.id }, META);
    await prisma.mktTask.create({ data: { title: `Arte ${tag}`, campaignId, assigneeId: mkt.principal.id, dueDate: new Date('2026-10-30T00:00:00Z') } });
  });
  afterAll(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  it('junta a equipe da campanha e o resumo', async () => {
    const d = await briefingData(vendas.principal, campaignId).catch((e) => e);
    expect(d).toBeInstanceOf(AuthorizationError);
    const b = await briefingData(mkt.principal, campaignId);
    expect(b.input).toMatchObject({ owner: mkt.principal.name, leadOwner: vendas.principal.name, tasks: [{ title: `Arte ${tag}`, assignee: mkt.principal.name }] });
    expect(b.team.map((m) => [m.name, m.why.join(','), m.hasPhone])).toEqual([
      [mkt.principal.name, 'responsável,tem tarefa', true],
      [vendas.principal.name, 'atende os leads', true],
    ].sort((a, c) => String(a[0]).localeCompare(String(c[0]), 'pt-BR')));
  });

  it('pessoas escolhidas + perfil sem repetir telefone; envia e registra o comunicado', async () => {
    const filter = { userIds: [mkt.principal.id, vendas.principal.id], roleKeys: [roleKey], numbers: [] };
    const pv = await previewNotice(mkt.principal, { audience: 'SELECAO', filter, kind: 'CAMPANHA', title: 'B', body: 'x', askConfirmation: false }, '2026-10-20');
    expect(pv).toMatchObject({ total: 2, comTelefone: 2 });
    const pick = { userIds: [], roleKeys: [], numbers: [], text: '📋 *BRIEFING — Aulão*\nFala, time!', askConfirmation: true };
    await expect(sendBriefing(vendas.principal, campaignId, { ...pick, roleKeys: [roleKey] }, '2026-10-20', META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(sendBriefing(mkt.principal, campaignId, pick, '2026-10-20', META)).rejects.toThrow(/pelo menos/);
    const r = await sendBriefing(mkt.principal, campaignId, { ...pick, roleKeys: [roleKey] }, '2026-10-20', META);
    expect(r).toMatchObject({ total: 1, enviados: 1, falhas: 0 });
    const n = await prisma.mktNotice.findFirstOrThrow({ where: { campaignId }, orderBy: { createdAt: 'desc' } });
    expect(n).toMatchObject({ kind: 'CAMPANHA', title: `Briefing — Aulão ${tag}`, audience: 'SELECAO', status: 'PUBLICADO', body: 'Fala, time!' });
    expect(await prisma.waConfirmation.count({ where: { kind: `aviso:${n.id}` } })).toBe(1);
  });
});
