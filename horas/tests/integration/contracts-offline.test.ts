import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { listTemplates, loadDefaultTemplates, requestSignCode, saveContract, sendContract } from '@/server/services/contract-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

// Celular da Nação fora do ar: a Z-API aceitaria a mensagem e ela nunca chegaria.
vi.mock('@/server/whatsapp/zapi', async (orig) => ({
  ...(await orig<typeof import('@/server/whatsapp/zapi')>()),
  zapiStatus: async () => ({ connected: true, smartphoneConnected: false, error: null }),
}));

describe.skipIf(!hasDb)('Contratos com o WhatsApp da Nação desconectado', () => {
  const prev = { s: process.env.STORAGE_FAKE, z: process.env.ZAPI_FAKE };
  const tag = randomUUID().slice(0, 6);
  beforeAll(() => { process.env.STORAGE_FAKE = '1'; process.env.ZAPI_FAKE = '1'; });
  afterAll(() => { process.env.STORAGE_FAKE = prev.s; process.env.ZAPI_FAKE = prev.z; });

  it('não finge que enviou: link fica para copiar e o código é recusado com aviso', async () => {
    await ensureCatalog();
    const admin = await makeUser('ADMIN');
    await loadDefaultTemplates(admin.principal, META);
    const t = (await listTemplates(admin.principal)).find((x) => x.category === 'ESPACO_MARKETING')!;
    const companyId = (await prisma.company.create({ data: { legalName: `Off ${tag} Ltda`, cnpj: String(Date.now() + 7).padEnd(14, '1').slice(0, 14), address: 'Brasília', legalRepresentative: 'Gestor' } })).id;
    const values = { parceiro_nome: `Parceiro ${tag}`, parceiro_documento: '11.222.333/0001-81', parceiro_endereco: 'Brasília', espaco: 'placa', valor: '800', forma_pagamento: 'boleto', inicio: '2026-12-01', fim: '2027-05-31' };
    const id = await saveContract(admin.principal, null, { templateId: t.id, companyId, title: `Off ${tag}`, values, signers: [{ role: 'CESSIONARIO', name: `Parceiro ${tag}`, phone: '61 98888-0009' }] }, META);
    const [sent] = await sendContract(admin.principal, id, 'https://nacao.test', META);
    expect(sent!.whatsapp).toMatch(/não enviado: o celular .* copie o link/);
    await expect(requestSignCode(sent!.link.split('/assinar/')[1]!, META)).rejects.toThrow(/Não conseguimos enviar o código agora/);
    // Nada de código gerado à toa.
    expect((await prisma.contractSigner.findFirstOrThrow({ where: { contractId: id } })).otpHash).toBeNull();
  });
});
