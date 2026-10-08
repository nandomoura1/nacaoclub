import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarX2, CheckCircle2, ChevronRight, FileWarning, FolderOpen, Hourglass, MinusCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, PageHeader } from '@/components/ui/card';
import { InternBadge } from '@/components/staff-docs/InternCounter';
import { INTERN_WARN_DAYS, type ChecklistItem } from '@/domain/staff-docs';
import { formatDateBR } from '@/domain/dates';
import { cn } from '@/lib/cn';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listTeamDocs } from '@/server/services/staff-doc-service';

export const metadata: Metadata = { title: 'Documentos da equipe' };

const FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'estagiarios', label: 'Estagiários' },
  { key: 'pendencias', label: 'Com pendência' },
] as const;

function Check({ c }: { c: ChecklistItem }) {
  const st = {
    ok: { icon: CheckCircle2, cls: 'text-sucesso', text: c.until ? `válido até ${formatDateBR(c.until)}` : 'na pasta' },
    faltando: { icon: XCircle, cls: 'text-critico', text: 'faltando' },
    vencido: { icon: XCircle, cls: 'text-critico', text: `vencido em ${c.until ? formatDateBR(c.until) : ''}` },
    opcional: { icon: MinusCircle, cls: 'text-tinta-fraca', text: 'opcional' },
  }[c.state];
  return (
    <span className="inline-flex items-center gap-1 text-xs" title={`${c.label}: ${st.text}`}>
      <st.icon className={cn('size-4 shrink-0', st.cls)} />
      <span className={cn(c.state === 'faltando' || c.state === 'vencido' ? 'font-semibold text-critico' : 'text-tinta-suave')}>{c.label.replace('Contrato de ', 'Contrato ')}</span>
    </span>
  );
}

/** Estágio vencido ou sem contrato primeiro, depois o que vence em breve. */
const urgency = (r: { internship: { state: string } | null }) => ({ vencido: 3, sem_contrato: 3, vence_em_breve: 2 } as Record<string, number>)[r.internship?.state ?? ''] ?? 0;

/** Pasta de documentos de toda a equipe + contador dos contratos de estágio. */
export default async function Page({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'teacher.docs')) redirect('/hoje');
  const today = todayIso();
  const rows = await listTeamDocs(principal, today);
  const f = (await searchParams).filtro;
  const filter = FILTERS.some((x) => x.key === f) ? f : 'todos';
  const interns = rows.filter((r) => r.intern);
  const expired = interns.filter((r) => r.internship?.state === 'vencido');
  const soon = interns.filter((r) => r.internship?.state === 'vence_em_breve');
  const noContract = interns.filter((r) => r.internship?.state === 'sem_contrato');
  const incomplete = rows.filter((r) => r.missing > 0);
  const shown = (filter === 'estagiarios' ? interns : filter === 'pendencias' ? incomplete : rows)
    .sort((a, b) => urgency(b) - urgency(a) || b.missing - a.missing || a.name.localeCompare(b.name));

  const Tile = ({ label, n, tone, icon: Icon, hint }: { label: string; n: number; tone: 'red' | 'amber' | 'blue'; icon: typeof FolderOpen; hint: string }) => (
    <Card className={cn('min-w-0 p-4', n > 0 && tone === 'red' && 'border-critico/40 bg-critico/5', n > 0 && tone === 'amber' && 'border-atencao/40 bg-atencao/5')}>
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-tinta-suave"><Icon className="size-4" /> {label}</p>
      <p className={cn('mt-1 font-titulo text-3xl font-extrabold tabular-nums', n > 0 && tone === 'red' ? 'text-critico' : n > 0 && tone === 'amber' ? 'text-atencao' : 'text-navy')}>{n}</p>
      <p className="text-xs text-tinta-fraca">{hint}</p>
    </Card>
  );

  return (
    <>
      <PageHeader title="Documentos da equipe" description="A pasta de cada funcionário: identidade, CREF e contrato de trabalho ou de estágio. O contador avisa antes do contrato de estágio vencer." />
      {expired.length > 0 && (
        <Card className="mb-4 flex items-start gap-3 border-critico/40 bg-critico/5 p-4">
          <CalendarX2 className="mt-0.5 size-5 shrink-0 text-critico" />
          <div className="text-sm">
            <p className="font-bold text-critico">Estagiário com contrato vencido não pode trabalhar</p>
            <p className="text-tinta">{expired.map((r) => r.displayName || r.name).join(', ')} — suba o aditivo/novo termo ou tire da escala.</p>
          </div>
        </Card>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Tile label="Estágio vencido" n={expired.length} tone="red" icon={CalendarX2} hint="contrato terminou" />
        <Tile label="Vence em breve" n={soon.length} tone="amber" icon={Hourglass} hint={`em até ${INTERN_WARN_DAYS} dias`} />
        <Tile label="Estagiário sem contrato" n={noContract.length} tone="red" icon={FileWarning} hint="termo não enviado" />
        <Tile label="Pastas incompletas" n={incomplete.length} tone="amber" icon={FolderOpen} hint={`de ${rows.length} funcionários ativos`} />
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((x) => (
          <Link key={x.key} href={x.key === 'todos' ? '?' : `?filtro=${x.key}`} className={cn('rounded-full px-3 py-1 font-semibold', filter === x.key ? 'bg-nacao text-white' : 'bg-white text-tinta-suave ring-1 ring-borda hover:text-tinta')}>{x.label}</Link>
        ))}
      </div>

      <Card className="divide-y divide-borda">
        {shown.length === 0 && <p className="p-4 text-sm text-tinta-suave">Nada por aqui.</p>}
        {shown.map((r) => (
          <Link key={r.id} href={`/professores/${r.id}?aba=documentos`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 p-3 hover:bg-fundo md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto_auto]">
            <span className="min-w-0">
              <span className="block truncate font-bold text-navy">{r.name}</span>
              <span className="block truncate text-xs text-tinta-suave">{[r.contractType, r.position].filter(Boolean).join(' · ') || 'vínculo não informado'}{r.files ? ` · ${r.files} arquivo${r.files > 1 ? 's' : ''}` : ''}</span>
            </span>
            <span className="col-span-2 flex flex-wrap gap-x-4 gap-y-1 md:col-span-1">{r.checklist.map((c) => <Check key={c.kind} c={c} />)}</span>
            <span className="col-span-2 md:col-span-1">{r.internship ? <InternBadge s={r.internship} /> : r.missing === 0 ? <Badge tone="green">pasta completa</Badge> : null}</span>
            <ChevronRight className="hidden size-4 text-tinta-fraca md:block" />
          </Link>
        ))}
      </Card>
    </>
  );
}
