import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { objectSize } from '@/server/storage';
import {
  cancelContract, contractCounts, deleteContract, draftPdf, getContract, listContracts, restoreContract, setContractTerm, terminateContract, listTemplates, loadDefaultTemplates, openSignLink, refuseSign, requestSignCode, resendLink,
  saveContract, saveTemplate, sendContract, signCodeHash, signerPdf, signWithCode,
} from '@/server/services/contract-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Contratos: modelo → contrato → link por WhatsApp → código → assinatura → PDF final (armazenamento local). */
describe.skipIf(!hasDb)('Contratos com assinatura eletrônica própria', () => {
  const prev = { s: process.env.STORAGE_FAKE, z: process.env.ZAPI_FAKE, t: process.env.ZAPI_TEST_PHONE };
  const tag = randomUUID().slice(0, 6);
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  let companyId: string;
  beforeAll(async () => {
    process.env.STORAGE_FAKE = '1'; process.env.ZAPI_FAKE = '1'; delete process.env.ZAPI_TEST_PHONE;
    await ensureCatalog();
    admin = await makeUser('ADMIN');
    lider = await makeUser('LIDER');
    companyId = (await prisma.company.create({ data: { legalName: `Nação Teste ${tag} Ltda`, cnpj: String(Date.now()).padEnd(14, '0').slice(0, 14), address: 'SMLN, Brasília/DF', legalRepresentative: 'Gestor Teste' } })).id;
  });
  afterAll(() => { process.env.STORAGE_FAKE = prev.s; process.env.ZAPI_FAKE = prev.z; if (prev.t) process.env.ZAPI_TEST_PHONE = prev.t; });

  const tokenOf = (link: string) => link.split('/assinar/')[1]!;
  /** Simula o código que chega no WhatsApp: pede o código e grava um conhecido no lugar. */
  const code = async (token: string, signerId: string) => {
    await requestSignCode(token, META);
    await prisma.contractSigner.update({ where: { id: signerId }, data: { otpHash: signCodeHash(signerId, '123456') } });
    return '123456';
  };

  it('modelos: carrega os modelos-base e confere variáveis', async () => {
    await expect(loadDefaultTemplates(lider.principal, META)).rejects.toBeInstanceOf(AuthorizationError);
    await loadDefaultTemplates(admin.principal, META);
    expect((await loadDefaultTemplates(admin.principal, META))).toEqual([]); // idempotente
    const names = (await listTemplates(admin.principal)).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['Prestação de serviços — professor/instrutor (PJ/MEI)', 'Cessão de espaço publicitário (marketing/patrocínio)']));
    await expect(saveTemplate(admin.principal, null, { name: `X ${tag}`, category: 'OUTRO', body: 'Texto com {{campo_sem_definicao}} '.repeat(5), fields: [], signerRoles: ['CONTRATANTE'] }, META)).rejects.toThrow(/sem campo/);
  });

  it('cria, envia, abre, assina com código (as duas partes) e guarda o PDF final', async () => {
    const t = (await listTemplates(admin.principal)).find((x) => x.category === 'PRESTADOR')!;
    const values = {
      contratado_nome: `Professor ${tag}`, contratado_documento: '529.982.247-25', contratado_endereco: 'SQN 100, Brasília/DF',
      servico: 'aulas de Beach Tennis', carga: 'terças e quintas, 18h às 21h', valor: '1.500,00', forma_remuneracao: 'por mês', dia_pagamento: '5',
      inicio: '2026-11-03', prazo: '12 meses', aviso_previo_dias: '30',
    };
    const signers = [
      { role: 'CONTRATANTE', name: 'Gestão Nação', phone: '61 98888-0001' },
      { role: 'CONTRATADO', name: `Professor ${tag}`, document: '52998224725', phone: '61 98888-0002' },
    ];
    await expect(saveContract(admin.principal, null, { templateId: t.id, title: 'Contrato', values, signers: [{ ...signers[1], document: '111.111.111-11' }] }, META)).rejects.toThrow(/CPF\/CNPJ inválido/);
    const id = await saveContract(admin.principal, null, { templateId: t.id, title: `Professor ${tag} — Beach Tennis`, values: { ...values, valor: '' }, signers }, META);
    // Sem o valor (obrigatório), não envia.
    await expect(sendContract(admin.principal, id, 'https://nacao.test', META)).rejects.toThrow(/Valor da remuneração/);
    // Sem a empresa contratante, não envia (o texto sairia com "[CNPJ da empresa]").
    await saveContract(admin.principal, id, { templateId: t.id, title: `Professor ${tag} — Beach Tennis`, values, signers }, META);
    await expect(sendContract(admin.principal, id, 'https://nacao.test', META)).rejects.toThrow(/empresa contratante/);
    await saveContract(admin.principal, id, { templateId: t.id, companyId, title: `Professor ${tag} — Beach Tennis`, values, signers }, META);
    const draft = await draftPdf(admin.principal, id);
    expect(Buffer.from(draft.bytes).subarray(0, 4).toString()).toBe('%PDF');

    const sent = await sendContract(admin.principal, id, 'https://nacao.test', META);
    expect(sent.map((x) => x.whatsapp)).toEqual(['enviado', 'enviado']);
    let c = await getContract(admin.principal, id);
    expect(c.status).toBe('AGUARDANDO');
    expect(c.body).toContain('R$ 1.500,00 (mil e quinhentos reais)');
    expect(c.body).toContain('529.982.247-25');
    expect(c.body).toContain(`Nação Teste ${tag} Ltda`);
    expect(c.body).not.toMatch(/\[[a-zçã ]+ da empresa\]/i);
    await expect(saveContract(admin.principal, id, { templateId: t.id, title: 'Outro', values, signers }, META)).rejects.toThrow(/já enviado/);

    const [nacao, prof] = c.signers;
    const tNacao = tokenOf(sent[0]!.link), tProf = tokenOf(sent[1]!.link);
    expect(await openSignLink('token-invalido-aaaaaaaaaaaa', META)).toBeNull();
    const view = (await openSignLink(tProf, META))!;
    expect(view.me).toMatchObject({ name: `Professor ${tag}`, status: 'PENDENTE', phone: '(61) *****-0002' });

    // Código errado conta tentativa; nome precisa bater; depois assina.
    await code(tProf, prof!.id);
    await expect(requestSignCode(tProf, META)).rejects.toThrow(/Aguarde 1 minuto/);
    await expect(signWithCode(tProf, { code: '000000', name: `Professor ${tag}`, agree: true }, META)).rejects.toThrow(/incorreto/);
    await expect(signWithCode(tProf, { code: '123456', name: 'Outra Pessoa', agree: true }, META)).rejects.toThrow(/nome não confere/);
    expect(await signWithCode(tProf, { code: '123456', name: `  professor ${tag.toUpperCase()} `, agree: true }, { ipAddress: '200.1.2.3', userAgent: 'Mozilla/5.0 (iPhone) Safari/604' })).toEqual({ completed: false });
    await expect(signWithCode(tProf, { code: '123456', name: `Professor ${tag}`, agree: true }, META)).rejects.toThrow(/já respondeu/);

    // Link antigo deixa de valer ao gerar um novo.
    const fresh = await resendLink(admin.principal, nacao!.id, 'https://nacao.test', META);
    expect(await openSignLink(tNacao, META)).toBeNull();
    const t2 = tokenOf(fresh.link);
    await code(t2, nacao!.id);
    expect(await signWithCode(t2, { code: '123456', name: 'Gestão Nação', agree: true }, META)).toEqual({ completed: true });

    c = await getContract(admin.principal, id);
    expect(c).toMatchObject({ status: 'ASSINADO', hasFinal: true });
    expect(c.events.map((e) => e.type)).toEqual(expect.arrayContaining(['CRIADO', 'ENVIADO', 'VISUALIZADO', 'CODIGO_ENVIADO', 'CODIGO_ERRADO', 'ASSINADO', 'LINK_NOVO', 'CONCLUIDO']));
    const row = await prisma.contract.findUniqueOrThrow({ where: { id } });
    expect(await objectSize(row.finalPath!)).toBeGreaterThan(1000);
    const pdf = (await signerPdf(tProf))!;
    expect(pdf.fileName).toMatch(/-assinado\.pdf$/);
    // O banco não guarda o código nem o token em texto.
    const s = await prisma.contractSigner.findUniqueOrThrow({ where: { id: prof!.id } });
    expect(s.otpHash).toBeNull();
    expect(s.tokenHash).not.toContain(tProf);
    expect(s).toMatchObject({ ipAddress: '200.1.2.3', status: 'ASSINADO' });
    await expect(cancelContract(admin.principal, id, 'teste', META)).rejects.toThrow(/assinado/);

    // Vigência lida dos campos: início 03/11/2026 + "12 meses" → até 02/11/2027.
    expect(c).toMatchObject({ startsOn: '2026-11-03', endsOn: '2027-11-02' });
    expect(['A_INICIAR', 'ATIVO']).toContain(c.termStatus);
    expect((await listContracts(admin.principal, { view: 'ativos', q: tag })).map((x) => x.id)).toEqual([id]);
    // Prazo vencido → inativo; ajuste não mexe no texto assinado.
    await expect(setContractTerm(admin.principal, id, { startsOn: '2025-01-10', endsOn: '2025-01-01' }, META)).rejects.toThrow(/antes do início/);
    await setContractTerm(admin.principal, id, { startsOn: '2025-01-01', endsOn: '2025-12-31' }, META);
    expect((await getContract(admin.principal, id)).termStatus).toBe('VENCIDO');
    expect((await listContracts(admin.principal, { view: 'inativos', q: tag })).map((x) => x.id)).toEqual([id]);
    expect((await getContract(admin.principal, id)).body).toBe(c.body);
    // Indeterminado → ativo; encerramento antecipado → inativo; desfazer → ativo.
    await setContractTerm(admin.principal, id, { startsOn: '2025-01-01', endsOn: null }, META);
    expect((await getContract(admin.principal, id)).termStatus).toBe('ATIVO');
    await terminateContract(admin.principal, id, { on: '2026-01-15', reason: 'Distrato assinado' }, META);
    expect((await getContract(admin.principal, id))).toMatchObject({ termStatus: 'ENCERRADO', terminationReason: 'Distrato assinado' });
    await terminateContract(admin.principal, id, null, META);
    expect((await getContract(admin.principal, id)).termStatus).toBe('ATIVO');

    // Lixeira: some das listas, o link do assinante morre, dá para restaurar.
    await expect(deleteContract(admin.principal, id, 'x', META)).rejects.toThrow(/motivo/);
    await expect(deleteContract(lider.principal, id, 'duplicado', META)).rejects.toBeInstanceOf(AuthorizationError);
    const before = await contractCounts(admin.principal);
    await deleteContract(admin.principal, id, 'Duplicado', META);
    expect((await listContracts(admin.principal, { view: 'todos', q: tag })).map((x) => x.id)).not.toContain(id);
    expect((await listContracts(admin.principal, { view: 'excluidos', q: tag })).map((x) => x.id)).toEqual([id]);
    expect((await contractCounts(admin.principal)).excluidos).toBe(before.excluidos + 1);
    expect(await signerPdf(tProf)).toBeNull();
    await expect(setContractTerm(admin.principal, id, { startsOn: null, endsOn: null }, META)).rejects.toThrow(/lixeira/);
    await restoreContract(admin.principal, id, META);
    expect((await getContract(admin.principal, id))).toMatchObject({ deletedAt: null, status: 'ASSINADO', hasFinal: true });
    expect((await getContract(admin.principal, id)).events.map((e) => e.type)).toEqual(expect.arrayContaining(['VIGENCIA', 'ENCERRADO', 'REATIVADO', 'EXCLUIDO', 'RESTAURADO']));
  });

  it('recusa e cancelamento: link cancelado para de funcionar', async () => {
    const t = (await listTemplates(admin.principal)).find((x) => x.category === 'ESPACO_MARKETING')!;
    const values = { parceiro_nome: `Parceiro ${tag}`, parceiro_documento: '11.222.333/0001-81', parceiro_endereco: 'Brasília', espaco: 'placa 3x1m', valor: '800', forma_pagamento: 'boleto mensal', inicio: '2026-12-01', fim: '2027-05-31' };
    const id = await saveContract(admin.principal, null, { templateId: t.id, companyId, title: `Placa ${tag}`, values, signers: [{ role: 'CESSIONARIO', name: `Parceiro ${tag}`, phone: '61 98888-0003' }] }, META);
    const { link } = (await sendContract(admin.principal, id, 'https://nacao.test', META))[0]!;
    await refuseSign(tokenOf(link), 'Valor diferente do combinado', META);
    expect((await getContract(admin.principal, id)).signers[0]).toMatchObject({ status: 'RECUSADO', refusedReason: 'Valor diferente do combinado' });
    await expect(deleteContract(admin.principal, id, 'Renegociar', META)).rejects.toThrow(/cancele antes/);
    await cancelContract(admin.principal, id, 'Renegociar o valor', META);
    await deleteContract(admin.principal, id, 'Cancelado, não precisa mais', META);
    expect(await openSignLink(tokenOf(link), META)).toBeNull();
    await expect(getContract(lider.principal, id)).rejects.toBeInstanceOf(AuthorizationError);
  });
});
