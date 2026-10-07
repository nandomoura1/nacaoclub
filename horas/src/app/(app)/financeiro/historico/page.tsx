import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeftRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Label, Select } from '@/components/ui/input';
import { monthLabel, monthTitle } from '@/domain/condominio/months';
import { compareMetrics } from '@/domain/financeiro/metrics';
import { cn } from '@/lib/cn';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { finHistory } from '@/server/services/fin-service';
import { fmtValue, IndValue } from '../_components/fmt';

export const metadata: Metadata = { title: 'Histórico financeiro' };

const signed = (v: number, unit: 'BRL' | 'PCT' | 'QTD') => `${v > 0 ? '+' : ''}${unit === 'PCT' ? `${(v * 100).toFixed(1).replace('.', ',')} p.p.` : fmtValue(v, unit)}`;

/** Cards por mês (última versão aprovada) e comparação mês A × mês B. */
export default async function Page({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'fin.view')) redirect('/hoje');
  const history = await finHistory(principal);
  const q = await searchParams;
  const desc = [...history].reverse();
  const A = history.find((h) => h.month === q.a) ?? desc[1] ?? null;
  const B = history.find((h) => h.month === q.b) ?? desc[0] ?? null;
  const rows = A && B && A.month !== B.month ? compareMetrics(A.m, B.m) : null;

  return (
    <>
      <PageHeader title="Histórico e comparação" description="Cada mês na sua última versão aprovada. Compare dois meses quaisquer." />
      {history.length >= 2 && (
        <Card className="mb-4 p-4">
          <form className="flex flex-wrap items-end gap-2">
            <div><Label htmlFor="a">Mês A</Label><Select id="a" name="a" defaultValue={A?.month}>{desc.map((h) => <option key={h.month} value={h.month}>{monthLabel(h.month)}</option>)}</Select></div>
            <ArrowLeftRight className="mb-3 size-4 text-tinta-fraca" />
            <div><Label htmlFor="b">Mês B</Label><Select id="b" name="b" defaultValue={B?.month}>{desc.map((h) => <option key={h.month} value={h.month}>{monthLabel(h.month)}</option>)}</Select></div>
            <Button size="md" variant="secondary" type="submit">Comparar</Button>
          </form>
          {rows ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-borda text-left text-xs text-tinta-suave"><th className="py-1 pr-3">Indicador</th><th className="py-1 pr-3 text-right">{monthTitle(A!.month)}</th><th className="py-1 pr-3 text-right capitalize">{monthTitle(B!.month)}</th><th className="py-1 pr-3 text-right">Variação</th><th className="py-1 text-right">%</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-b border-borda/60">
                      <td className="py-1 pr-3">{r.label}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{fmtValue(r.a, r.unit)}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{fmtValue(r.b, r.unit)}</td>
                      <td className={cn('py-1 pr-3 text-right tabular-nums', r.delta === null && 'text-tinta-fraca')}>{r.delta === null ? '—' : signed(r.delta, r.unit)}</td>
                      <td className="py-1 text-right tabular-nums text-tinta-suave">{r.deltaPct === null ? '—' : `${r.deltaPct > 0 ? '+' : ''}${(r.deltaPct * 100).toFixed(1).replace('.', ',')}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-tinta-fraca">Percentuais variam em pontos percentuais (p.p.). “Dado não informado” não entra na variação.</p>
            </div>
          ) : <p className="mt-2 text-sm text-tinta-suave">Escolha dois meses diferentes.</p>}
        </Card>
      )}
      {history.length === 0 && <Card className="p-4 text-sm text-tinta-suave">Nenhum mês aprovado ainda.</Card>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
        {desc.map((h) => (
          <Link key={h.month} href={`/financeiro/competencias/${h.month}`} className="block">
            <Card className="h-full p-4 hover:border-nacao/40">
              <div className="flex items-center gap-2">
                <b className="flex-1 text-navy">{monthTitle(h.month)}</b>
                <Badge tone="navy">v{h.version}</Badge>
                {h.status !== 'APPROVED' && <Badge tone="amber">alterado depois</Badge>}
              </div>
              <dl className="mt-2 space-y-0.5 text-sm">
                {([['Recebimentos', h.m.recebimentos], ['Pagamentos', h.m.pagamentos], ['Geração antes do payout', h.m.fluxo.geracaoAntesPayout], ['Pessoal', h.m.pessoalPctRecebimentos], ['Caixa disponível', h.m.caixa.disponivel], ['Alunos', h.m.alunos.total]] as const).map(([l, i]) => (
                  <div key={l} className="flex justify-between gap-2"><dt className="text-tinta-suave">{l}</dt><dd className="text-right font-semibold text-navy"><IndValue ind={i} /></dd></div>
                ))}
              </dl>
              {h.analysis?.conclusao && <p className="mt-2 line-clamp-3 text-xs text-tinta-suave">{h.analysis.conclusao}</p>}
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
