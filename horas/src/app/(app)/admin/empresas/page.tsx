import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, Building2, CheckCircle2, ChevronRight, Hourglass, Landmark, Plus, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { formatCnpj } from '@/domain/company';
import { cn } from '@/lib/cn';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { companyAlerts, listCompanies } from '@/server/services/company-service';
import { ValidityBadge } from './ValidityBadge';

export const metadata: Metadata = { title: 'Empresas' };

/** Empresas do grupo: dados gerais, contas e a pasta de documentos essenciais. */
export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'company.view')) redirect('/hoje');
  const today = todayIso();
  const [rows, alerts] = await Promise.all([listCompanies(principal, today), companyAlerts(principal, today)]);
  return (
    <>
      <PageHeader title="Empresas" description="Dados gerais, contas bancárias e os documentos essenciais de cada empresa do grupo. Licenças, procurações e certidões avisam antes de vencer."
        actions={can(principal, 'company.edit') ? <Link href="/admin/empresas/nova" className={buttonVariants()}><Plus /> Nova empresa</Link> : undefined} />

      {alerts.length > 0 && (
        <Card className={cn('mb-4 p-4', alerts.some((a) => a.state === 'vencido') ? 'border-critico/40 bg-critico/5' : 'border-atencao/40 bg-atencao/5')}>
          <p className="flex items-center gap-2 text-sm font-bold text-navy"><AlertTriangle className="size-4 text-atencao" /> Documentos vencidos ou vencendo</p>
          <ul className="mt-2 space-y-1">
            {alerts.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <Link href={`/admin/empresas/${a.companyId}?aba=documentos`} className="font-semibold text-navy hover:underline">{a.company}</Link>
                <span className="text-tinta-suave">· {a.label}</span>
                <ValidityBadge state={a.state} daysLeft={a.daysLeft} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <Building2 className="size-8 text-nacao" />
          <p className="font-bold text-navy">Nenhuma empresa cadastrada</p>
          <p className="max-w-md text-sm text-tinta-suave">Cadastre cada CNPJ do grupo (ex.: Nação Club, Nação Crossfit) com dados gerais, contas bancárias e a pasta de documentos.</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
          {rows.map((r) => (
            <Link key={r.id} href={`/admin/empresas/${r.id}`} className="group block">
              <Card className={cn('h-full p-4 transition-colors group-hover:border-nacao/40', !r.active && 'opacity-60')}>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-navy to-nacao text-white"><Building2 className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-navy">{r.tradeName || r.legalName}{!r.active && <Badge className="ml-2">inativa</Badge>}</p>
                    <p className="truncate text-xs text-tinta-suave">{r.tradeName ? `${r.legalName} · ` : ''}{r.cnpj ? `CNPJ ${formatCnpj(r.cnpj)}` : 'CNPJ não informado'}</p>
                  </div>
                  <ChevronRight className="size-4 text-tinta-fraca" />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {r.checklist.map((c) => (
                    <span key={c.kind} className="inline-flex items-center gap-1" title={c.label}>
                      {c.state === 'faltando' || c.state === 'vencido' ? <XCircle className="size-3.5 text-critico" /> : c.state === 'vence_em_breve' ? <Hourglass className="size-3.5 text-atencao" /> : <CheckCircle2 className="size-3.5 text-sucesso" />}
                      <span className={cn(c.state === 'faltando' || c.state === 'vencido' ? 'font-semibold text-critico' : 'text-tinta-suave')}>{c.label}</span>
                    </span>
                  ))}
                </div>
                <p className="mt-2 flex items-center gap-3 text-xs text-tinta-fraca">
                  <span>{r.files} arquivo(s)</span>
                  <span className="inline-flex items-center gap-1"><Landmark className="size-3.5" /> {r.bankAccounts} conta(s)</span>
                  {r.expired > 0 && <Badge tone="red">{r.expired} vencido(s)</Badge>}
                  {r.expiring > 0 && <Badge tone="amber">{r.expiring} vencendo</Badge>}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
