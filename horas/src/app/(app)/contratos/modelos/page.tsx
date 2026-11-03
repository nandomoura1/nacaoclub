import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listTemplates } from '@/server/services/contract-service';
import { prisma } from '@/server/db';
import { TemplatesClient } from './TemplatesClient';

export const metadata: Metadata = { title: 'Modelos de contrato' };

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'contract.view')) redirect('/hoje');
  const [templates, companies] = await Promise.all([
    listTemplates(principal, { all: true }),
    prisma.company.findMany({ where: { active: true }, select: { legalName: true, tradeName: true, cnpj: true } }),
  ]);
  return (
    <>
      <PageHeader title="Modelos de contrato" description="Textos-padrão com campos {{variáveis}}. Quem cria o contrato só preenche os campos. Revise os modelos com o jurídico antes do primeiro uso." />
      <TemplatesClient templates={templates} companies={companies} canEdit={can(principal, 'contract.templates')} />
    </>
  );
}
