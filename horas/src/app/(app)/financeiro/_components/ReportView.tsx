import type { ReactNode } from 'react';
import { compareMetrics, KEY_INDICATORS, type Ind, type Metrics } from '@/domain/financeiro/metrics';
import { monthTitle, type Month } from '@/domain/condominio/months';
import type { Analysis } from '@/server/financeiro/analysis';
import { cn } from '@/lib/cn';
import { ShareBars } from './charts';
import { brl, fmtValue, IndValue, Kpi, pct } from './fmt';

/**
 * Relatório Financeiro (20 seções). Números e tabelas vêm do motor; os
 * textos, da análise da IA (quando gerada). "Visão dos sócios" é o resumo.
 */
export type ReportMode = 'completo' | 'socios';

const CHECK_TONE = { divergencia: 'border-critico/40 bg-critico/5', conciliacao: 'border-atencao/40 bg-atencao/5', atencao: 'border-atencao/40 bg-atencao/5', meta: 'border-nacao/30 bg-nacao/5' } as const;
const CHECK_LABEL = { divergencia: 'Divergência', conciliacao: 'Conciliação', atencao: 'Atenção', meta: 'Meta' } as const;

function Section({ n, title, children, comment }: { n: number; title: string; children?: ReactNode; comment?: string | null }) {
  return (
    <section className="break-inside-avoid border-t border-borda pt-4 print:pt-3">
      <h2 className="text-base font-extrabold text-navy"><span className="mr-2 text-tinta-fraca">{n}.</span>{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
      {comment && <p className="mt-2 rounded-lg bg-fundo p-3 text-sm leading-relaxed text-tinta print:bg-transparent print:p-0">{comment}</p>}
    </section>
  );
}

function Pairs({ rows }: { rows: [string, Ind][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 [&>*]:min-w-0">
      {rows.map(([label, ind]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 border-b border-dashed border-borda py-1">
          <dt className="text-tinta-suave">{label}</dt>
          <dd className="text-right font-semibold text-navy"><IndValue ind={ind} /></dd>
        </div>
      ))}
    </dl>
  );
}

function Table({ head, rows, align }: { head: string[]; rows: ReactNode[][]; align?: ('l' | 'r')[] }) {
  if (!rows.length) return <p className="text-sm italic text-tinta-fraca">Dado não informado</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-borda text-left text-xs text-tinta-suave">{head.map((h, i) => <th key={h} className={cn('py-1 pr-3 font-semibold', align?.[i] === 'r' && 'text-right')}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-borda/60">{r.map((c, j) => <td key={j} className={cn('py-1 pr-3', align?.[j] === 'r' && 'text-right tabular-nums')}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function List({ items, empty }: { items: string[] | undefined; empty: string }) {
  if (!items?.length) return <p className="text-sm italic text-tinta-fraca">{empty}</p>;
  return <ul className="list-disc space-y-1 pl-5 text-sm text-tinta">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>;
}

export function ReportView({ month, m, analysis, previous, managerNotes, partnerDecisions, mode, version }: {
  month: Month; m: Metrics; analysis: Analysis | null; previous: { month: Month; m: Metrics } | null;
  managerNotes: string | null; partnerDecisions: string | null; mode: ReportMode; version: number | null;
}) {
  const a = analysis;
  const s = a?.secoes;
  const noText = 'Análise ainda não gerada.';
  const compare = previous ? compareMetrics(previous.m, m) : null;
  const header = (
    <header className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">Relatório Financeiro Nação Club{mode === 'socios' ? ' · Visão dos sócios' : ''}</p>
      <h1 className="text-2xl font-extrabold text-navy">{monthTitle(month)}</h1>
      <p className="text-xs text-tinta-suave">
        {version ? `Versão ${version} aprovada` : 'Rascunho — ainda não aprovado'}
        {m.source === 'importado' ? ' · números de relatório importado (sem detalhe)' : m.source === 'misto' ? ' · parte dos números veio de relatório importado' : ''}
        {a ? ` · análise gerada em ${new Date(a.generatedAt).toLocaleDateString('pt-BR')}` : ''}
      </p>
      <p className="mt-1 text-[11px] text-tinta-fraca">Fluxo financeiro (recebimentos e pagamentos do período) — não é DRE por competência nem lucro contábil.</p>
    </header>
  );
  const kpis = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 [&>*]:min-w-0">
      {KEY_INDICATORS.slice(0, 8).map((k) => <Kpi key={k.key} label={k.label} ind={k.get(m)} />)}
    </div>
  );
  const attention = [...m.checks.map((c) => c.message), ...(a?.pontosAtencao ?? []).filter((t) => !m.checks.some((c) => t.includes(c.message)))];
  const context = (managerNotes || partnerDecisions) && (
    <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
      {managerNotes && <div className="rounded-lg border border-borda p-3 text-sm"><p className="text-xs font-semibold text-tinta-suave">Observações do gestor (contexto, não dado financeiro)</p><p className="mt-1 whitespace-pre-line">{managerNotes}</p></div>}
      {partnerDecisions && <div className="rounded-lg border border-borda p-3 text-sm"><p className="text-xs font-semibold text-tinta-suave">Decisões dos sócios</p><p className="mt-1 whitespace-pre-line">{partnerDecisions}</p></div>}
    </div>
  );

  if (mode === 'socios') {
    return (
      <article className="space-y-4">
        {header}
        {kpis}
        <Section n={1} title="Resumo para os sócios" comment={a?.resumoSocios ?? noText}>
          <Pairs rows={[
            ['Recebimentos', m.recebimentos], ['Pagamentos', m.pagamentos], ['Geração de caixa antes do payout', m.fluxo.geracaoAntesPayout],
            ['Custo de pessoal', m.pessoal], ['Payout total', m.payout.total], ['Lanchonete (PDV)', m.lanchonete.faturamento],
            ['CMV', m.cmv.pct], ['Base de alunos', m.alunos.total], ['Caixa disponível', m.caixa.disponivel], ['Investimentos', m.investimentos.total],
          ]} />
        </Section>
        <Section n={2} title="Pontos de atenção"><List items={attention} empty="Sem pontos de atenção." /></Section>
        <Section n={3} title="Conclusão" comment={a?.conclusao ?? noText}>{context}</Section>
      </article>
    );
  }

  return (
    <article className="space-y-4">
      {header}
      <Section n={1} title="Resumo executivo" comment={a?.resumoExecutivo ?? noText}>
        {kpis}
        {compare && (
          <details className="text-sm" open>
            <summary className="cursor-pointer text-xs font-semibold text-nacao print:hidden">Comparação com {monthTitle(previous!.month)}</summary>
            <Table
              head={['Indicador', monthTitle(previous!.month), monthTitle(month), 'Variação']}
              align={['l', 'r', 'r', 'r']}
              rows={compare.map((r) => [r.label, fmtValue(r.a, r.unit), fmtValue(r.b, r.unit),
                r.delta === null ? '—' : r.unit === 'PCT' ? `${r.delta > 0 ? '+' : ''}${(r.delta * 100).toFixed(1).replace('.', ',')} p.p.` : `${r.delta > 0 ? '+' : ''}${fmtValue(r.delta, r.unit)}${r.deltaPct !== null ? ` (${r.deltaPct > 0 ? '+' : ''}${(r.deltaPct * 100).toFixed(1).replace('.', ',')}%)` : ''}`])}
            />
          </details>
        )}
        {context}
      </Section>

      <Section n={2} title="Recebimentos" comment={s?.recebimentos}>
        <Pairs rows={[['Recebimentos totais', m.recebimentos], ['Receita operacional', m.receitaOperacional], ['Receita de serviços', m.receitaServicos], ['Receita de vendas', m.receitaVendas], ['Entradas financeiras (aporte/empréstimo)', m.entradasFinanceiras]]} />
        <ShareBars rows={m.revenueByCategory.map((r) => ({ label: r.label, cents: r.cents, ratio: r.ratio }))} />
      </Section>

      <Section n={3} title="Base de alunos" comment={s?.alunos}>
        <Pairs rows={[['Matrículas/participações', m.alunos.total], ['Custo de pessoal por aluno', m.custoPessoalPorAluno]]} />
        <Table head={['Modalidade', 'Alunos', '% da base', 'Receita', 'Ticket médio']} align={['l', 'r', 'r', 'r', 'r']}
          rows={m.modalidades.length
            ? m.modalidades.map((x) => [x.label, x.alunos ?? '—', pct(x.ratio), x.cents === null ? '—' : brl(x.cents), <IndValue key="t" ind={x.ticket} />])
            : m.alunos.byModality.map((x) => [x.label, x.qty, pct(x.ratio), '—', '—'])} />
        <p className="text-[11px] text-tinta-fraca">Base de alunos = soma de matrículas por modalidade; uma pessoa em duas modalidades conta duas vezes (não são clientes únicos).</p>
      </Section>

      <Section n={4} title="Pagamentos" comment={s?.pagamentos}>
        <Pairs rows={[['Pagamentos totais', m.pagamentos], ['Investimentos (CAPEX)', m.capex], ['Pagamentos antes do payout', m.fluxo.pagamentosAntesPayout]]} />
        <ShareBars rows={m.expenseByCategory.map((r) => ({ label: r.label, cents: r.cents, ratio: r.ratio, note: r.classification }))} />
      </Section>

      <Section n={5} title="Pessoal" comment={s?.pessoal}>
        <Pairs rows={[['Custo econômico de pessoal', m.pessoal], ['% dos recebimentos', m.pessoalPctRecebimentos], ['% da receita de serviços', m.pessoalPctServicos], ['Receita de serviços por R$ 1 de pessoal', m.servicosPorPessoal]]} />
        <ShareBars rows={m.pessoalComponents.map((r) => ({ label: r.label, cents: r.cents, ratio: r.ratio }))} />
        {m.pessoalExcluded.length > 0 && (
          <div className="text-sm"><p className="text-xs font-semibold text-tinta-suave">Fora do custo de pessoal (mostrados à parte)</p>
            <ul className="mt-1 space-y-0.5">{m.pessoalExcluded.map((r) => <li key={r.key} className="flex justify-between gap-3"><span>{r.label}</span><span className="tabular-nums">{brl(r.cents)}</span></li>)}</ul>
          </div>
        )}
      </Section>

      <Section n={6} title="Tênis (parceria)" comment={s?.tenis}>
        <Pairs rows={[['Faturamento bruto do Tênis', m.tenis.faturamento], ['Repasse ao parceiro', m.tenis.repasse], ['% repassado', m.tenis.pctRepasse], ['Repasse esperado pelo contrato', m.tenis.esperado], ['Margem antes dos demais custos', m.tenis.margem]]} />
      </Section>

      <Section n={7} title="Lanchonete" comment={s?.lanchonete}>
        <Pairs rows={[['Faturamento (PDV)', m.lanchonete.faturamento], ['Vendas', m.lanchonete.vendas], ['Ticket médio', m.lanchonete.ticketMedio], ['Cancelamentos', m.lanchonete.cancelamentos], ['Estornos', m.lanchonete.estornos], ['Compras para revenda', m.lanchonete.compras], ['Conta Assinada (total)', m.lanchonete.contaAssinada], ['Conta Assinada não comercial', m.lanchonete.contaAssinadaNaoComercial], ['Vendas efetivas', m.lanchonete.vendasEfetivas]]} />
        {m.lanchonete.contaAssinadaPorClasse.length > 0 && <ShareBars rows={m.lanchonete.contaAssinadaPorClasse.map((r) => ({ label: `Conta Assinada · ${r.label}`, cents: r.cents, ratio: r.ratio }))} />}
        {m.productGroups.length > 0 && <ShareBars rows={m.productGroups.map((r) => ({ label: r.label, cents: r.cents, ratio: r.ratio }))} />}
      </Section>

      <Section n={8} title="Formas de pagamento" comment={s?.formasPagamento}>
        <ShareBars rows={m.lanchonete.payments.map((r) => ({ label: r.label, cents: r.cents, ratio: r.ratio }))} />
        <Pairs rows={[['Soma das formas', m.lanchonete.paymentsSum]]} />
      </Section>

      <Section n={9} title="Ticket Funcionário" comment={s?.ticketFuncionario}>
        <Pairs rows={[['Ticket Funcionário', m.lanchonete.ticketFuncionario], ['% do faturamento do PDV', m.lanchonete.ticketFuncionarioPct]]} />
        <p className="text-[11px] text-tinta-fraca">Consumo interno/benefício — não é receita comercial.</p>
      </Section>

      <Section n={10} title="Top 20 produtos" comment={s?.topProdutos}>
        <Table head={['#', 'Produto', 'Grupo', 'Qtd.', 'Valor', '%']} align={['l', 'l', 'l', 'r', 'r', 'r']}
          rows={m.topProdutos.map((p) => [p.rank, <span key="n">{p.label}{p.interno && <span className="ml-1 text-[11px] text-atencao">(consumo interno)</span>}</span>, p.groupLabel, p.quantidade ?? '—', brl(p.cents), pct(p.ratio)])} />
      </Section>

      <Section n={11} title="CMV" comment={s?.cmv}>
        <Pairs rows={[['CMV', m.cmv.valor], ['CMV ÷ faturamento da lanchonete', m.cmv.pct]]} />
        <p className="text-xs text-tinta-suave">Metodologia: {m.cmv.metodo === 'real' ? 'CMV real (estoque inicial + compras − estoque final).' : m.cmv.metodo === 'estimado_compras' ? 'CMV ESTIMADO por compras do mês (sem inventário).' : 'Dado não informado.'}</p>
      </Section>

      <Section n={12} title="Investimentos" comment={s?.investimentos}>
        <Pairs rows={[['Investimentos do mês', m.investimentos.total]]} />
        <Table head={['Item', 'Classificação', 'Valor']} align={['l', 'l', 'r']} rows={m.investimentos.items.map((i) => [i.label, i.classification ?? '—', brl(i.cents)])} />
        {m.financiamentos.length > 0 && <Table head={['Financiamentos e aportes', 'Valor']} align={['l', 'r']} rows={m.financiamentos.map((f) => [f.label, f.cents === null ? '—' : brl(f.cents)])} />}
      </Section>

      <Section n={13} title="Payout" comment={s?.payout}>
        <Pairs rows={[['Distribuição de lucros', m.payout.distribuicao], ['Antecipação', m.payout.antecipacao], ['Retiradas', m.payout.retiradas], ['Payout total', m.payout.total], ['Distribuição ÷ recebimentos', m.payout.distribuicaoPct], ['Payout total ÷ recebimentos', m.payout.totalPct]]} />
        <p className="text-[11px] text-tinta-fraca">Payout é distribuição aos sócios — nunca despesa operacional.</p>
      </Section>

      <Section n={14} title="Recebimentos × Pagamentos" comment={s?.fluxo}>
        <Pairs rows={[['Recebimentos − pagamentos', m.fluxo.diferenca], ['Pagamentos antes do payout', m.fluxo.pagamentosAntesPayout], ['Geração de caixa antes do payout', m.fluxo.geracaoAntesPayout]]} />
        <p className="text-[11px] text-tinta-fraca">Indicadores de fluxo financeiro — não são lucro nem prejuízo.</p>
      </Section>

      <Section n={15} title="Caixa" comment={s?.caixa}>
        <Pairs rows={[['Caixa disponível', m.caixa.disponivel], ['Previsto a receber (fora do caixa)', m.caixa.aReceber]]} />
        <Table head={['Conta', 'Tipo', 'Saldo']} align={['l', 'l', 'r']} rows={m.caixa.accounts.map((c) => [c.label, c.kind === 'a_receber' ? 'A receber' : 'Disponível', brl(c.cents)])} />
      </Section>

      <Section n={16} title="Pontos positivos"><List items={a?.pontosPositivos} empty={noText} /></Section>
      <Section n={17} title="Pontos de atenção">
        {m.checks.length > 0 && (
          <ul className="space-y-1">{m.checks.map((c) => <li key={c.key} className={cn('rounded-lg border px-3 py-2 text-sm', CHECK_TONE[c.level])}><b className="mr-1">{CHECK_LABEL[c.level]}:</b>{c.message}</li>)}</ul>
        )}
        <List items={a?.pontosAtencao?.filter((t) => !m.checks.some((c) => t.includes(c.message)))} empty={a ? 'Sem outros pontos.' : noText} />
      </Section>
      <Section n={18} title="Riscos"><List items={a?.riscos} empty={noText} /></Section>
      <Section n={19} title="Resumo para os sócios" comment={a?.resumoSocios ?? noText} />
      <Section n={20} title="Conclusão" comment={a?.conclusao ?? noText} />
      {a && <p className="text-[11px] text-tinta-fraca">Textos gerados por IA a partir dos indicadores calculados pelo sistema; números não são alterados pela IA.</p>}
    </article>
  );
}
