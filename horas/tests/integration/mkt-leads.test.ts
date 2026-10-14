import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { clickLink, deleteLead, ingestLead, listLeads, listLinks, saveLink, setLeadStage } from '@/server/services/mkt-leads-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Marketing — Leads (webhook de formulário) e links rastreáveis. Dados fictícios. */
describe.skipIf(!hasDb)('Marketing — leads e links', () => {
  const tag = randomUUID().slice(0, 6);
  const ddd = String(11 + Math.floor(Math.random() * 80));
  const phone = `(${ddd}) 9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let mkt: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    await ensureCatalog();
    admin = await makeUser('ADMIN');
    mkt = await makeUser('MARKETING');
    lider = await makeUser('LIDER');
  });

  it('link curto com UTM: cria, conta clique e liga o lead do formulário ao link', async () => {
    const id = await saveLink(mkt.principal, null, { title: `Bio ${tag}`, slug: null, destination: 'https://www.exemplo.com/aula?x=1', channel: 'INSTAGRAM', utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, campaignId: null, active: true }, META);
    const link = await prisma.mktLink.findUniqueOrThrow({ where: { id } });
    expect(link.slug).toBe(`bio-${tag}`);
    expect(link.utmSource).toBe('instagram');
    await expect(saveLink(mkt.principal, null, { title: `Bio ${tag}`, slug: null, destination: 'https://x.com', channel: 'SITE', utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, campaignId: null, active: true }, META)).rejects.toThrow(/Já existe/);

    const url = await clickLink(link.slug, '2026-10-14');
    expect(url).toContain('utm_source=instagram');
    expect(url).toContain('x=1');
    await clickLink(link.slug, '2026-10-14');
    expect((await prisma.mktLink.findUniqueOrThrow({ where: { id } })).clicks).toBe(2);
    expect(await clickLink('nao-existe-' + tag, '2026-10-14')).toBeNull();

    // Formulário do Wix com a UTM do link → lead de Instagram ligado ao link.
    const r = await ingestLead({ data: { submissionId: `sub-${tag}`, submissions: [{ label: 'Primeiro nome', value: 'Ana' }, { label: 'Sobrenome', value: `Teste ${tag}` }, { label: 'Telefone', value: phone }, { label: 'Modalidade', value: 'Natação' }, { label: 'utm_source', value: 'instagram' }, { label: 'utm_campaign', value: link.slug }] } });
    expect(r.result).toBe('criado');
    const lead = await prisma.mktLead.findUniqueOrThrow({ where: { id: r.id! } });
    expect(lead.name).toBe(`Ana Teste ${tag}`);
    expect(lead.source).toBe('INSTAGRAM');
    expect(lead.linkId).toBe(id);
    expect(lead.interest).toBe('Natação');
    expect((await listLinks(mkt.principal)).find((l) => l.id === id)?.leads).toBe(1);

    // Mesmo envio → duplicado; mesmo telefone com outro envio → atualiza o lead.
    expect((await ingestLead({ data: { submissionId: `sub-${tag}`, submissions: [{ label: 'Telefone', value: phone }] } })).result).toBe('duplicado');
    const again = await ingestLead({ nome: 'Ana', telefone: phone, mensagem: 'Tem horário à noite?' });
    expect(again).toEqual({ result: 'atualizado', id: lead.id });
    expect((await prisma.mktLead.findUniqueOrThrow({ where: { id: lead.id } })).notes).toContain('horário à noite');
    expect((await ingestLead({ assunto: 'nada' })).result).toBe('ignorado');

    // Funil: matrícula marca conversão; perdido exige motivo.
    await expect(setLeadStage(mkt.principal, lead.id, 'PERDIDO', null, META)).rejects.toThrow(/por que/);
    await setLeadStage(mkt.principal, lead.id, 'MATRICULADO', null, META);
    expect((await prisma.mktLead.findUniqueOrThrow({ where: { id: lead.id } })).convertedAt).not.toBeNull();
    const list = await listLeads(mkt.principal, { q: tag });
    expect(JSON.stringify(list)).toContain(`Ana Teste ${tag}`);

    // Permissões: líder não vê; só admin de marketing exclui.
    await expect(listLeads(lider.principal)).rejects.toBeInstanceOf(AuthorizationError);
    await deleteLead(admin.principal, lead.id, META);
    expect(await prisma.mktLead.findUnique({ where: { id: lead.id } })).toBeNull();
  });
});
