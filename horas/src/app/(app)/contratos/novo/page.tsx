import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listTemplates } from '@/server/services/contract-service';
import { ContractForm } from '../ContractForm';

export const metadata: Metadata = { title: 'Novo contrato' };

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'contract.edit')) redirect('/contratos');
  const [templates, companies] = await Promise.all([
    listTemplates(principal),
    prisma.company.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { legalName: 'asc' }], select: { id: true, legalName: true, tradeName: true } }),
  ]);
  return (
    <>
      <PageHeader title="Novo contrato" description="Escolha o modelo, preencha os campos e confira a prévia. Depois de salvar, você envia para assinatura." />
      {templates.length === 0 ? (
        <Card className="p-6 text-sm text-tinta-suave">
          Nenhum modelo ativo. {can(principal, 'contract.templates') ? <Link href="/contratos/modelos" className="font-semibold text-nacao">Cadastre ou carregue os modelos iniciais</Link> : 'Peça a quem cuida dos modelos para cadastrar.'}
        </Card>
      ) : (
        <ContractForm templates={templates} companies={companies.map((c) => ({ id: c.id, name: c.tradeName ?? c.legalName }))} initial={null} />
      )}
    </>
  );
}
