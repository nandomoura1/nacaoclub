import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCnpj } from '@/domain/company';
import { cn } from '@/lib/cn';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { NotFoundError } from '@/server/errors';
import { getCompany } from '@/server/services/company-service';
import { CompanyDocs, CompanyForm } from './CompanyClient';

export const metadata: Metadata = { title: 'Empresa' };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'company.view')) redirect('/hoje');
  const { id } = await params;
  const canEdit = can(principal, 'company.edit');
  const back = <Link href="/admin/empresas" className="mb-3 inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-nacao"><ArrowLeft className="size-4" /> Empresas</Link>;

  if (id === 'nova') {
    if (!canEdit) redirect('/admin/empresas');
    return (
      <>
        {back}
        <h1 className="mb-4 text-2xl font-extrabold text-navy">Nova empresa</h1>
        <CompanyForm id={null} initial={null} canEdit />
      </>
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const v = await getCompany(principal, id, todayIso()).catch((e) => { if (e instanceof NotFoundError) return null; throw e; });
  if (!v) notFound();
  const aba = (await searchParams).aba === 'documentos' ? 'documentos' : 'dados';
  const alerts = v.expired + v.expiring + v.missing;

  return (
    <>
      {back}
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-navy to-nacao text-white"><Building2 className="size-6" /></span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold text-navy">{v.tradeName || v.legalName}{!v.active && <Badge className="ml-2 align-middle">inativa</Badge>}</h1>
          <p className="truncate text-sm text-tinta-suave">{v.tradeName ? `${v.legalName} · ` : ''}{v.cnpj ? `CNPJ ${formatCnpj(v.cnpj)}` : 'CNPJ não informado'}</p>
        </div>
      </div>
      <nav className="mb-4 flex gap-1 border-b border-borda">
        {[['dados', 'Dados gerais'], ['documentos', 'Documentos']].map(([k, label]) => (
          <Link key={k} href={`?aba=${k}`} className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-semibold', aba === k ? 'border-nacao text-navy' : 'border-transparent text-tinta-suave hover:text-navy')}>
            {label}{k === 'documentos' && alerts > 0 && <Badge tone={v.expired || v.missing ? 'red' : 'amber'} className="ml-1.5">{alerts}</Badge>}
          </Link>
        ))}
      </nav>
      {aba === 'dados' ? <CompanyForm id={v.id} initial={v.data} canEdit={canEdit} /> : <CompanyDocs v={v} canEdit={canEdit} />}
    </>
  );
}
