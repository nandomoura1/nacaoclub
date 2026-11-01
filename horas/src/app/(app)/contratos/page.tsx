import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FilePlus2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { CONTRACT_CATEGORIES, CONTRACT_STATUS } from '@/domain/contracts';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listContracts } from '@/server/services/contract-service';

export const metadata: Metadata = { title: 'Contratos' };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'contract.view')) redirect('/hoje');
  const sp = await searchParams;
  const status = CONTRACT_STATUS.some((s) => s.id === sp.status) ? sp.status : undefined;
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const rows = await listContracts(principal, { status, q });
  const edit = can(principal, 'contract.edit');
  return (
    <>
      <PageHeader
        title="Contratos"
        description="Contratos a partir de modelos: preencha os campos, envie o link por WhatsApp e cada parte assina com um código. Assinado, o PDF fica disponível aqui e no link."
        actions={edit ? <Link href="/contratos/novo" className={buttonVariants()}><FilePlus2 /> Novo contrato</Link> : undefined}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-tinta-fraca" />
          <Input name="q" defaultValue={q} placeholder="Buscar por título, código ou parte" className="pl-9" />
        </div>
        <Select name="status" defaultValue={status ?? ''} className="w-56">
          <option value="">Todos os status</option>
          {CONTRACT_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        <button className={buttonVariants({ variant: 'secondary' })}>Filtrar</button>
      </form>
      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-tinta-suave">
          Nenhum contrato {q || status ? 'com esse filtro' : 'ainda'}.{' '}
          {edit && !q && !status && <Link href="/contratos/novo" className="font-semibold text-nacao">Criar o primeiro</Link>}
        </Card>
      ) : (
        <Card className="divide-y divide-borda">
          {rows.map((c) => {
            const st = CONTRACT_STATUS.find((s) => s.id === c.status);
            const signed = c.signers.filter((s) => s.status === 'ASSINADO').length;
            return (
              <Link key={c.id} href={`/contratos/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-fundo">
                <span className="w-28 shrink-0 font-mono text-xs font-semibold text-tinta-suave">{c.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-tinta">{c.title}</span>
                  <span className="block truncate text-xs text-tinta-suave">{CONTRACT_CATEGORIES.find((x) => x.id === c.category)?.label} · {c.signers.map((s) => s.name).join(', ')}</span>
                </span>
                <span className="text-xs text-tinta-suave">{c.status === 'AGUARDANDO' ? `${signed}/${c.signers.length} assinaram` : c.status === 'ASSINADO' ? `assinado em ${fmt(c.completedAt)}` : `criado em ${fmt(c.createdAt)}`}</span>
                <Badge tone={st?.tone ?? 'neutral'}>{st?.label ?? c.status}</Badge>
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}
