import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { companyAlerts, deleteCompanyDoc, getCompany, getCompanyDocFile, listCompanies, saveCompany, setCompanyDocArchived, uploadCompanyDoc } from '@/server/services/company-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Empresas com dados fictícios (CNPJ de exemplo válido). */
describe.skipIf(!hasDb)('Empresas', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let id = '';
  const T = '2026-10-08';
  const pdf = (n: string) => new File([`%PDF ${randomUUID()}`], n, { type: 'application/pdf' });
  const doc = (kind: string, extra: Record<string, string> = {}) => ({ kind, title: '', validFrom: '', validUntil: '', notes: '', ...extra });

  beforeAll(async () => {
    await ensureCatalog();
    admin = await makeUser('ADMIN');
    await prisma.company.deleteMany({ where: { cnpj: '11222333000181' } });
  });

  it('cadastra com CNPJ válido e contas; recusa CNPJ inválido e duplicado; auditoria sem número de conta', async () => {
    await expect(saveCompany(admin.principal, null, { legalName: 'Empresa Teste Ltda', cnpj: '11.222.333/0001-82' }, META)).rejects.toThrow(/CNPJ inválido/);
    id = await saveCompany(admin.principal, null, {
      legalName: 'Empresa Teste Ltda', tradeName: 'Teste', cnpj: '11.222.333/0001-81', openingDate: '2020-01-15',
      bankAccounts: [{ bank: 'Banco Exemplo', agency: '0001', account: '12345-6', pixKey: 'chave-exemplo' }],
    }, META);
    await expect(saveCompany(admin.principal, null, { legalName: 'Outra', cnpj: '11222333000181' }, META)).rejects.toThrow(/já está cadastrado/);
    const v = await getCompany(admin.principal, id, T);
    expect(v.data).toMatchObject({ cnpj: '11222333000181', openingDate: '2020-01-15', bankAccounts: [{ bank: 'Banco Exemplo', account: '12345-6' }] });
    const log = await prisma.auditLog.findFirst({ where: { entityId: id, action: 'company.created' } });
    expect(JSON.stringify(log?.after)).not.toContain('12345-6');
    await saveCompany(admin.principal, id, { ...v.data, openingDate: v.data.openingDate ?? '', cnpj: v.data.cnpj ?? '', bankAccounts: [] }, META);
    expect((await getCompany(admin.principal, id, T)).data.bankAccounts).toEqual([]);
  });

  it('documentos: validade gera alerta; arquivar tira do alerta; duplicado recusado; excluir', async () => {
    await uploadCompanyDoc(admin.principal, id, doc('CONTRATO_SOCIAL'), pdf('contrato.pdf'), META);
    const lic = await uploadCompanyDoc(admin.principal, id, doc('LICENCA_FUNCIONAMENTO', { validUntil: '2026-10-01' }), pdf('licenca.pdf'), META);
    expect((await companyAlerts(admin.principal, T)).find((a) => a.companyId === id)).toMatchObject({ state: 'vencido', daysLeft: -7 });
    await uploadCompanyDoc(admin.principal, id, doc('LICENCA_FUNCIONAMENTO', { validUntil: '2027-10-01' }), pdf('licenca-nova.pdf'), META);
    await setCompanyDocArchived(admin.principal, lic, true, META);
    expect((await companyAlerts(admin.principal, T)).some((a) => a.companyId === id)).toBe(false);
    const row = (await listCompanies(admin.principal, T)).find((r) => r.id === id)!;
    expect(row.checklist.find((c) => c.kind === 'LICENCA_FUNCIONAMENTO')!.state).toBe('vigente');
    expect(row.missing).toBe(2); // cartão CNPJ e informações bancárias (contas removidas no teste anterior)
    const f = pdf('dup.pdf');
    await uploadCompanyDoc(admin.principal, id, doc('OUTRO'), f, META);
    await expect(uploadCompanyDoc(admin.principal, id, doc('OUTRO'), f, META)).rejects.toThrow(/já está na pasta/);
    expect((await getCompanyDocFile(admin.principal, lic)).filename).toBe('licenca.pdf');
    await deleteCompanyDoc(admin.principal, lic, META);
    expect((await getCompany(admin.principal, id, T)).documents.some((d) => d.id === lic)).toBe(false);
  });

  it('permissões: coordenador não vê empresas nem alerta', async () => {
    const coord = await makeUser('COORDENADOR');
    await expect(listCompanies(coord.principal, T)).rejects.toBeInstanceOf(AuthorizationError);
    expect(await companyAlerts(coord.principal, T)).toEqual([]);
    await expect(getCompanyDocFile(coord.principal, randomUUID())).rejects.toBeInstanceOf(AuthorizationError);
  });
});
