import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/card';
import { CONTRACT_STATUS } from '@/domain/contracts';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { NotFoundError } from '@/server/errors';
import { getContract, listTemplates } from '@/server/services/contract-service';
import { ContractForm } from '../ContractForm';
import { ContractPanel } from './ContractPanel';

export const metadata: Metadata = { title: 'Contrato' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'contract.view')) redirect('/hoje');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect('/contratos');
  let c;
  try { c = await getContract(principal, id); } catch (e) { if (e instanceof NotFoundError) redirect('/contratos'); throw e; }
  const edit = can(principal, 'contract.edit');
  const draft = c.status === 'RASCUNHO' && edit;
  const st = CONTRACT_STATUS.find((s) => s.id === c.status);
  const [templates, companies] = draft
    ? await Promise.all([
        listTemplates(principal, { all: true }),
        prisma.company.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { legalName: 'asc' }], select: { id: true, legalName: true, tradeName: true } }),
      ])
    : [[], []];
  return (
    <>
      <Link href="/contratos" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-tinta-suave hover:text-nacao"><ArrowLeft className="size-4" /> Contratos</Link>
      <PageHeader title={c.title} description={`${c.code} · ${c.template?.name ?? 'modelo removido'}`} actions={<Badge tone={st?.tone ?? 'neutral'} className="text-xs">{st?.label ?? c.status}</Badge>} />
      <ContractPanel contract={c} canEdit={edit} />
      {draft && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-extrabold text-navy">Editar rascunho</h2>
          <ContractForm
            templates={templates.filter((t) => t.active || t.id === c.templateId)}
            companies={companies.map((x) => ({ id: x.id, name: x.tradeName ?? x.legalName }))}
            initial={{ id: c.id, code: c.code, templateId: c.templateId, companyId: c.companyId, title: c.title, values: c.values, notes: c.notes, signers: c.signers }}
          />
        </div>
      )}
    </>
  );
}
