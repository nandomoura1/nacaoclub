'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronDown, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { monthLabel, monthTitle, type Month } from '@/domain/condominio/months';
import { DATASETS } from '@/domain/financeiro/taxonomy';
import { cn } from '@/lib/cn';
import type { FinPackageAnalysis } from '@/server/services/fin-service';
import { FIN_STATUS, fmtValue, IndValue } from '../_components/fmt';
import { datasetLabel, lineValue } from '../_components/lines';
import { commitPackageAction, discardHistoricAction } from '../actions';

const SHOW = ['recebimentos', 'pagamentos', 'geracao', 'pessoal', 'pessoal_pct', 'lanchonete', 'cmv_pct', 'caixa', 'alunos'];

/** Prévia do pacote histórico: mês a mês, o que entra, avisos e "planilha × sistema". Tudo vai para conferência. */
export function PackageView({ pkg, onDone }: { pkg: FinPackageAnalysis; onDone: (msg: string) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set(pkg.months.filter((m) => !m.existing && m.lines.length).map((m) => m.month)));
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string[] | null>(null);
  const toggle = (m: string) => setSel((s) => { const n = new Set(s); if (n.has(m)) n.delete(m); else n.add(m); return n; });
  const known = pkg.rules.filter((r) => r.known).length;

  if (done) {
    return (
      <Card className="p-5">
        <p className="flex items-center gap-2 font-bold text-navy"><CheckCircle2 className="size-5 text-sucesso" /> Pacote importado para conferência</p>
        <p className="mt-1 text-sm text-tinta-suave">Abra cada mês, confira os dados (Confirmar todos, se estiver tudo certo) e aprove. Só meses aprovados entram no painel e no histórico.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {done.map((m) => <Link key={m} href={`/financeiro/competencias/${m}`} className="rounded-full bg-nacao/10 px-3 py-1 text-sm font-semibold text-nacao hover:bg-nacao/20">{monthLabel(m as Month)} →</Link>)}
        </div>
        <Button className="mt-4" variant="secondary" size="sm" onClick={() => onDone(`Pacote importado: ${done.length} mês(es) aguardando conferência.`)}>Importar outro arquivo</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <p className="font-bold text-navy">Pacote histórico: {pkg.filename}</p>
        <p className="text-sm text-tinta-suave">Esquema {pkg.schemaVersion ?? '?'} · {pkg.months.length} competência(s) · lido sem IA, direto das abas. Célula vazia = “Dado não informado” (nunca zero).</p>
        {pkg.rules.length > 0 && (
          <p className="mt-2 flex items-center gap-1 text-sm text-sucesso"><ShieldCheck className="size-4" /> {known} de {pkg.rules.length} regras de negócio da planilha já são aplicadas pelo motor do sistema.</p>
        )}
        {pkg.warnings.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-atencao">{pkg.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        <p className="mt-2 text-xs text-tinta-fraca">Indicadores calculados da planilha (%, diferenças) não são importados: o sistema recalcula e mostra a comparação abaixo.</p>
      </Card>

      {pkg.months.map((m) => {
        const on = sel.has(m.month);
        const okKpis = m.kpis.filter((k) => k.ok).length;
        const counts = DATASETS.map((d) => ({ label: d.label, n: m.lines.filter((l) => l.dataset === d.id).length })).filter((c) => c.n);
        return (
          <Card key={m.month} className={cn('p-4', !on && 'opacity-70')}>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input type="checkbox" checked={on} disabled={!m.lines.length && !m.managerNotes.length} onChange={() => toggle(m.month)} className="size-4" />
                <b className="text-navy">{monthTitle(m.month)}</b>
              </label>
              {m.importStatus && <Badge tone={m.importStatus === 'REFERENCIA' ? 'green' : m.importStatus === 'PARCIAL' ? 'blue' : 'amber'}>{m.importStatus.replace(/_/g, ' ').toLowerCase()}</Badge>}
              {m.approvedInFile && <Badge tone="navy">aprovado na planilha</Badge>}
              {m.existing && <Badge tone={FIN_STATUS[m.existing.status]?.tone}>já existe · {FIN_STATUS[m.existing.status]?.label}{m.existing.version ? ` v${m.existing.version}` : ''}</Badge>}
            </div>
            <p className="mt-1 text-xs text-tinta-suave">{m.lines.length} dado(s){counts.length ? `: ${counts.map((c) => `${c.n} ${c.label.toLowerCase()}`).join(' · ')}` : ''}{m.managerNotes.length + m.partnerDecisions.length ? ` · ${m.managerNotes.length + m.partnerDecisions.length} observação(ões)` : ''}</p>
            {m.existing && on && <p className="mt-1 text-xs font-semibold text-atencao">Este mês já tem {m.existing.lines} dado(s): os da planilha serão somados para conferência (nada é apagado). Confira duplicidades antes de aprovar.</p>}

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 [&>*]:min-w-0">
              {m.indicators.filter((i) => SHOW.includes(i.key) && i.ind.value !== null).map((i) => (
                <div key={i.key} className="flex justify-between gap-2 border-b border-dashed border-borda py-0.5"><dt className="truncate text-tinta-suave">{i.label}</dt><dd className="font-semibold text-navy"><IndValue ind={i.ind} /></dd></div>
              ))}
            </dl>

            {m.kpis.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <p className="text-xs font-semibold text-tinta-suave">Planilha × sistema ({okKpis}/{m.kpis.length} iguais)</p>
                <table className="mt-1 w-full text-xs">
                  <tbody>
                    {m.kpis.map((k) => (
                      <tr key={k.code} className="border-b border-borda/60">
                        <td className="py-0.5 pr-2">{k.label}</td>
                        <td className="py-0.5 pr-2 text-right tabular-nums">planilha {fmtValue(k.file, k.unit)}</td>
                        <td className="py-0.5 pr-2 text-right tabular-nums">sistema {fmtValue(k.engine, k.unit)}</td>
                        <td className="py-0.5 text-right">{k.ok ? <Badge tone="green">igual</Badge> : <Badge tone="amber">diferente</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {m.warnings.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-atencao">{m.warnings.map((w, i) => <li key={i} className="flex gap-1"><TriangleAlert className="mt-0.5 size-3 shrink-0" /> {w}</li>)}</ul>
            )}

            {(m.lines.length > 0 || m.managerNotes.length > 0) && (
              <button onClick={() => setOpen(open === m.month ? null : m.month)} className="mt-2 flex items-center gap-1 text-xs font-semibold text-nacao">
                <ChevronDown className={cn('size-3 transition-transform', open === m.month && 'rotate-180')} /> {open === m.month ? 'Esconder' : 'Ver'} os dados
              </button>
            )}
            {open === m.month && (
              <div className="mt-2 space-y-2 text-xs">
                <ul className="divide-y divide-borda rounded-lg border border-borda">
                  {m.lines.map((l, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 px-2 py-1">
                      <span className="w-40 shrink-0 text-tinta-fraca">{datasetLabel(l.dataset)}</span>
                      <span className="min-w-0 flex-1 truncate">{l.label}{l.unit && l.unit !== l.label ? ` · ${l.unit}` : ''}</span>
                      <span className="font-semibold tabular-nums text-navy">{lineValue(l)}</span>
                    </li>
                  ))}
                </ul>
                {m.managerNotes.length > 0 && <div><p className="font-semibold text-tinta-suave">Observações do gestor</p><ul className="list-disc pl-4">{m.managerNotes.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
                {m.partnerDecisions.length > 0 && <div><p className="font-semibold text-tinta-suave">Decisões dos sócios</p><ul className="list-disc pl-4">{m.partnerDecisions.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
              </div>
            )}
          </Card>
        );
      })}

      <Card className="flex flex-wrap items-center gap-2 border-nacao/30 p-4">
        <p className="min-w-0 flex-1 text-sm">Importa <b>{sel.size}</b> mês(es) como <b>para conferir</b>. Nada é aprovado aqui: você confere e aprova cada mês depois.</p>
        <Button disabled={pending || !sel.size} onClick={() => start(async () => {
          setError(null);
          const r = await commitPackageAction(pkg.documentId, [...sel].sort());
          if (!r.ok) return setError(r.error);
          setDone(r.data.months);
        })}><CheckCircle2 /> {pending ? 'Importando…' : 'Importar para conferência'}</Button>
        <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await discardHistoricAction(pkg.documentId); onDone('Importação cancelada. Nada foi gravado.'); })}><X /> Cancelar</Button>
        <div className="w-full"><FormMessage error={error} /></div>
      </Card>
    </div>
  );
}
