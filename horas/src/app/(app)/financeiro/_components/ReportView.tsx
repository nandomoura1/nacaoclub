import type { ReactNode } from 'react';
import {
  AlertTriangle, ArrowLeftRight, Banknote, CheckCircle2, ChefHat, CreditCard, Crown, Flag, GraduationCap, Landmark, PiggyBank, Receipt,
  ShieldAlert, Sparkles, Trophy, Users, UtensilsCrossed, Wallet, type LucideIcon, BadgePercent, Ticket, Hammer,
} from 'lucide-react';
import { compareMetrics, type Ind, type Metrics } from '@/domain/financeiro/metrics';
import { firstDay, lastDay, monthTitle, type Month } from '@/domain/condominio/months';
import { formatDateBR } from '@/domain/dates';
import type { Analysis } from '@/server/financeiro/analysis';
import { ShieldMark } from '@/components/Logo';
import { cn } from '@/lib/cn';
import { ShareBars } from './charts';
import { brl, fmtValue, pct, StatusTag } from './fmt';

/**
 * Relatório Financeiro (20 seções) na identidade da Nação Club: capa navy com
 * o escudo, números-chave em destaque, seções numeradas em cartões, leitura
 * da análise em ciano. Números e tabelas vêm do motor; textos, da análise da IA.
 * "Visão dos sócios" é o resumo. Imprime em cores (print-color-adjust).
 */
export type ReportMode = 'completo' | 'socios';

const CHECK_STYLE = {
  divergencia: { box: 'border-critico/30 bg-critico/5', tag: 'bg-critico text-white', label: 'Divergência' },
  conciliacao: { box: 'border-atencao/30 bg-atencao/5', tag: 'bg-atencao text-white', label: 'Conciliação' },
  atencao: { box: 'border-atencao/30 bg-atencao/5', tag: 'bg-atencao text-white', label: 'Atenção' },
  meta: { box: 'border-nacao/25 bg-nacao/5', tag: 'bg-nacao text-white', label: 'Meta' },
} as const;

const indText = (i: Ind) => fmtValue(i.value, i.unit);

function Section({ n, title, icon: Icon, children, comment }: { n: number; title: string; icon: LucideIcon; children?: ReactNode; comment?: string | null }) {
  return (
    <section className="break-inside-avoid rounded-[18px] border border-borda bg-white p-4 shadow-[0_1px_3px_rgba(2,43,87,0.06)] sm:p-5 print:rounded-none print:border-0 print:border-t print:p-0 print:pt-4 print:shadow-none">
      <header className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-linear-to-br from-nacao to-azul-claro text-white shadow-sm">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="font-titulo text-[10px] font-bold uppercase tracking-[0.2em] text-ciano">{String(n).padStart(2, '0')}</p>
          <h2 className="font-titulo text-lg font-extrabold leading-tight text-navy">{title}</h2>
        </div>
      </header>
      <div className="mt-4 space-y-4">{children}</div>
      {comment && <Reading text={comment} />}
    </section>
  );
}

/** Leitura da análise (IA) — destacada, separada dos números. */
function Reading({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-xl border-l-4 border-ciano bg-ciano/8 px-4 py-3">
      <p className="flex items-center gap-1.5 font-titulo text-[10px] font-bold uppercase tracking-[0.18em] text-nacao"><Sparkles className="size-3" /> Leitura</p>
      <p className="mt-1 text-sm leading-relaxed text-tinta">{text}</p>
    </div>
  );
}

/** Grade de indicadores: rótulo pequeno, valor forte. */
function Stats({ rows, cols = 3 }: { rows: [string, Ind][]; cols?: 2 | 3 | 4 }) {
  return (
    <dl className={cn('grid gap-2 [&>*]:min-w-0', cols === 2 ? 'sm:grid-cols-2' : cols === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3')}>
      {rows.map(([label, ind]) => (
        <div key={label} className="rounded-xl bg-fundo px-3 py-2.5" title={ind.formula}>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">{label}</dt>
          <dd className={cn('mt-0.5 flex flex-wrap items-center gap-1.5 font-titulo text-base font-extrabold tabular-nums text-navy', ind.value === null && 'font-corpo text-sm font-normal italic text-tinta-fraca')}>
            {indText(ind)} <StatusTag status={ind.status} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Table({ head, rows, align }: { head: string[]; rows: ReactNode[][]; align?: ('l' | 'r')[] }) {
  if (!rows.length) return <p className="text-sm italic text-tinta-fraca">Dado não informado</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-borda">
      <table className="w-full text-sm">
        <thead><tr className="bg-navy text-left text-[11px] uppercase tracking-wide text-white">{head.map((h, i) => <th key={h} className={cn('px-3 py-2 font-semibold', align?.[i] === 'r' && 'text-right')}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-borda/70 even:bg-fundo/70">{r.map((c, j) => <td key={j} className={cn('px-3 py-1.5', align?.[j] === 'r' && 'text-right tabular-nums')}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-tinta-fraca">{children}</p>;
}

const LIST_STYLE = {
  positivo: { icon: CheckCircle2, ring: 'border-sucesso/25 bg-sucesso/5', dot: 'text-sucesso' },
  atencao: { icon: AlertTriangle, ring: 'border-atencao/25 bg-atencao/5', dot: 'text-atencao' },
  risco: { icon: ShieldAlert, ring: 'border-critico/25 bg-critico/5', dot: 'text-critico' },
} as const;
function Points({ items, empty, tone }: { items: string[] | undefined; empty: string; tone: keyof typeof LIST_STYLE }) {
  const st = LIST_STYLE[tone];
  if (!items?.length) return <p className="text-sm italic text-tinta-fraca">{empty}</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2 [&>*]:min-w-0">
      {items.map((t, i) => (
        <li key={i} className={cn('flex gap-2 rounded-xl border px-3 py-2 text-sm leading-snug', st.ring)}>
          <st.icon className={cn('mt-0.5 size-4 shrink-0', st.dot)} /> <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** Bloco escuro (resumo dos sócios, conclusão). */
function Spotlight({ label, text, icon: Icon }: { label: string; text: string; icon: LucideIcon }) {
  return (
    <section className="break-inside-avoid overflow-hidden rounded-[18px] bg-navy p-5 text-white">
      <p className="flex items-center gap-2 font-titulo text-[11px] font-bold uppercase tracking-[0.2em] text-ciano"><Icon className="size-4" /> {label}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-white/90">{text}</p>
    </section>
  );
}

export function ReportView({ month, m, analysis, previous, managerNotes, partnerDecisions, mode, version }: {
  month: Month; m: Metrics; analysis: Analysis | null; previous: { month: Month; m: Metrics } | null;
  managerNotes: string | null; partnerDecisions: string | null; mode: ReportMode; version: number | null;
}) {
  const a = analysis;
  const s = a?.secoes;
  const noText = 'Análise ainda não gerada.';
  const compare = previous ? compareMetrics(previous.m, m) : null;
  const [title, year] = [monthTitle(month).split(' de ')[0], month.slice(0, 4)];

  const hero: [string, Ind][] = [
    ['Recebimentos', m.recebimentos], ['Pagamentos', m.pagamentos],
    ['Geração antes do payout', m.fluxo.geracaoAntesPayout], ['Caixa disponível', m.caixa.disponivel],
  ];
  const secondary: [string, Ind, LucideIcon][] = [
    ['Pessoal ÷ recebimentos', m.pessoalPctRecebimentos, Users], ['CMV lanchonete', m.cmv.pct, BadgePercent],
    ['Base de alunos', m.alunos.total, GraduationCap], ['Payout total', m.payout.total, Crown],
  ];

  const cover = (
    <header className="relative overflow-hidden rounded-[22px] bg-navy text-white print:rounded-none">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-nacao/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-ciano/20 blur-3xl" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-linear-to-r from-nacao via-azul-claro to-ciano" />
      <div className="relative p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2.5">
            <ShieldMark className="h-9" />
            <span className="leading-none">
              <span className="block font-titulo text-base font-extrabold tracking-tight">NAÇÃO CLUB</span>
              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">Relatório Financeiro</span>
            </span>
          </span>
          <span className={cn('shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide', version ? 'bg-ciano text-navy' : 'bg-white/15 text-white')}>
            {version ? `v${version} · aprovada` : 'Rascunho'}
          </span>
        </div>

        <div className="mt-6">
          {mode === 'socios' && <p className="font-titulo text-xs font-bold uppercase tracking-[0.25em] text-ciano">Visão dos sócios</p>}
          <h1 className="font-titulo text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">{title} <span className="text-ciano">{year}</span></h1>
          <p className="mt-2 text-sm text-white/70">
            Período {formatDateBR(firstDay(month))} a {formatDateBR(lastDay(month))}
            {a ? ` · análise de ${new Date(a.generatedAt).toLocaleDateString('pt-BR')}` : ''}
            {m.source === 'importado' ? ' · números de relatório importado' : m.source === 'misto' ? ' · parte dos números de relatório importado' : ''}
          </p>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
          {hero.map(([label, ind]) => (
            <div key={label} className="rounded-2xl bg-white/[0.07] p-3 ring-1 ring-white/10 backdrop-blur-sm" title={ind.formula}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/60">{label}</dt>
              <dd className={cn('mt-1 font-titulo text-lg font-extrabold tabular-nums sm:text-2xl', ind.value === null && 'font-corpo text-sm font-normal italic text-white/50', ind.value !== null && ind.value < 0 && 'text-[#ffb4a8]')}>
                {indText(ind)}
              </dd>
              {ind.status === 'estimativa' && <span className="mt-1 inline-block rounded-full bg-atencao/90 px-2 text-[10px] font-semibold">estimativa</span>}
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[11px] text-white/50">Fluxo financeiro do período (recebimentos e pagamentos) — não é DRE por competência nem lucro contábil.</p>
      </div>
    </header>
  );

  const pills = (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
      {secondary.map(([label, ind, Icon]) => (
        <div key={label} className="relative overflow-hidden rounded-2xl border border-borda bg-white p-3" title={ind.formula}>
          <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-nacao to-ciano" />
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-tinta-suave"><Icon className="size-3.5 text-nacao" /> {label}</p>
          <p className={cn('mt-1 flex flex-wrap items-center gap-1.5 font-titulo text-xl font-extrabold tabular-nums text-navy', ind.value === null && 'font-corpo text-sm font-normal italic text-tinta-fraca')}>
            {indText(ind)} <StatusTag status={ind.status} />
          </p>
        </div>
      ))}
    </div>
  );

  const context = (managerNotes || partnerDecisions) && (
    <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
      {managerNotes && <div className="rounded-xl border border-dashed border-nacao/30 bg-white p-3 text-sm"><p className="font-titulo text-[10px] font-bold uppercase tracking-[0.18em] text-nacao">Observações do gestor</p><p className="mt-1 whitespace-pre-line leading-relaxed">{managerNotes}</p><Note>Contexto — não é dado financeiro.</Note></div>}
      {partnerDecisions && <div className="rounded-xl border border-dashed border-nacao/30 bg-white p-3 text-sm"><p className="font-titulo text-[10px] font-bold uppercase tracking-[0.18em] text-nacao">Decisões dos sócios</p><p className="mt-1 whitespace-pre-line leading-relaxed">{partnerDecisions}</p></div>}
    </div>
  );

  const checkList = m.checks.length > 0 && (
    <ul className="space-y-2">
      {m.checks.map((c) => (
        <li key={c.key} className={cn('flex items-start gap-2 rounded-xl border px-3 py-2 text-sm', CHECK_STYLE[c.level].box)}>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', CHECK_STYLE[c.level].tag)}>{CHECK_STYLE[c.level].label}</span>
          <span className="leading-snug">{c.message}</span>
        </li>
      ))}
    </ul>
  );
  const extraAttention = (a?.pontosAtencao ?? []).filter((t) => !m.checks.some((c) => t.includes(c.message)));

  const footer = (
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-borda pt-4 text-[11px] text-tinta-fraca">
      <span className="inline-flex items-center gap-2"><ShieldMark tone="light" className="h-5" /> Nação Club · Relatório Financeiro · {monthTitle(month)}</span>
      <span>{a ? 'Textos gerados por IA a partir dos indicadores calculados pelo sistema; a IA não altera números.' : 'Números calculados pelo motor do Nação ADM.'}</span>
      <span className="w-full text-center font-titulo font-semibold text-nacao/70">Muitos esportes, muitas paixões, uma Nação!</span>
    </footer>
  );

  const wrap = (children: ReactNode) => (
    <article className="space-y-4 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">{children}</article>
  );

  if (mode === 'socios') {
    return wrap(
      <>
        {cover}
        {pills}
        {a?.resumoSocios && <Spotlight label="Resumo para os sócios" text={a.resumoSocios} icon={Crown} />}
        <Section n={1} title="Números do mês" icon={Banknote}>
          <Stats rows={[
            ['Recebimentos', m.recebimentos], ['Pagamentos', m.pagamentos], ['Geração antes do payout', m.fluxo.geracaoAntesPayout],
            ['Custo de pessoal', m.pessoal], ['Payout total', m.payout.total], ['Lanchonete (PDV)', m.lanchonete.faturamento],
            ['CMV', m.cmv.pct], ['Base de alunos', m.alunos.total], ['Caixa disponível', m.caixa.disponivel], ['Investimentos', m.investimentos.total],
          ]} />
        </Section>
        <Section n={2} title="Pontos de atenção" icon={AlertTriangle}>
          {checkList}
          <Points items={extraAttention} empty={m.checks.length ? '' : 'Sem pontos de atenção.'} tone="atencao" />
        </Section>
        {context}
        <Spotlight label="Conclusão" text={a?.conclusao ?? noText} icon={Flag} />
        {footer}
      </>,
    );
  }

  return wrap(
    <>
      {cover}
      {pills}

      <Section n={1} title="Resumo executivo" icon={Trophy} comment={a?.resumoExecutivo ?? noText}>
        {compare && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-tinta-suave"><ArrowLeftRight className="size-3.5" /> Comparação com {monthTitle(previous!.month)}</p>
            <Table
              head={['Indicador', monthTitle(previous!.month), monthTitle(month), 'Variação']}
              align={['l', 'r', 'r', 'r']}
              rows={compare.map((r) => [r.label, fmtValue(r.a, r.unit), fmtValue(r.b, r.unit),
                r.delta === null ? '—' : (
                  <span key="d" className={cn('font-semibold', r.delta > 0 ? 'text-sucesso' : r.delta < 0 ? 'text-critico' : '')}>
                    {r.unit === 'PCT' ? `${r.delta > 0 ? '+' : ''}${(r.delta * 100).toFixed(1).replace('.', ',')} p.p.` : `${r.delta > 0 ? '+' : ''}${fmtValue(r.delta, r.unit)}${r.deltaPct !== null ? ` (${r.deltaPct > 0 ? '+' : ''}${(r.deltaPct * 100).toFixed(1).replace('.', ',')}%)` : ''}`}
                  </span>
                )])}
            />
          </div>
        )}
        {context}
      </Section>

      <Section n={2} title="Recebimentos" icon={Banknote} comment={s?.recebimentos}>
        <Stats rows={[['Recebimentos totais', m.recebimentos], ['Receita de serviços', m.receitaServicos], ['Receita de vendas', m.receitaVendas], ['Receita operacional', m.receitaOperacional], ['Entradas financeiras', m.entradasFinanceiras]]} />
        <ShareBars rows={m.revenueByCategory.map((r) => ({ label: r.label, cents: r.cents, ratio: r.ratio }))} />
      </Section>

      <Section n={3} title="Base de alunos" icon={GraduationCap} comment={s?.alunos}>
        <Stats cols={2} rows={[['Matrículas / participações', m.alunos.total], ['Custo de pessoal por aluno', m.custoPessoalPorAluno]]} />
        <Table head={['Modalidade', 'Alunos', '% da base', 'Receita', 'Ticket médio']} align={['l', 'r', 'r', 'r', 'r']}
          rows={m.modalidades.length
            ? m.modalidades.map((x) => [x.label, x.alunos ?? '—', pct(x.ratio), x.cents === null ? '—' : brl(x.cents), x.ticket.value === null ? '—' : <span key="t">{indText(x.ticket)} <StatusTag status={x.ticket.status} /></span>])
            : m.alunos.byModality.map((x) => [x.label, x.qty, pct(x.ratio), '—', '—'])} />
        <Note>Soma de matrículas por modalidade: uma pessoa em duas modalidades conta duas vezes (não são clientes únicos).</Note>
      </Section>

      <Section n={4} title="Pagamentos" icon={Receipt} comment={s?.pagamentos}>
        <Stats rows={[['Pagamentos totais', m.pagamentos], ['Pagamentos antes do payout', m.fluxo.pagamentosAntesPayout], ['Investimentos (CAPEX)', m.capex]]} />
        <ShareBars rows={m.expenseByCategory.map((r) => ({ label: r.label, cents: r.cents, ratio: r.ratio, note: r.classification }))} />
      </Section>

      <Section n={5} title="Custo de pessoal" icon={Users} comment={s?.pessoal}>
        <Stats cols={4} rows={[['Custo econômico', m.pessoal], ['÷ recebimentos', m.pessoalPctRecebimentos], ['÷ receita de serviços', m.pessoalPctServicos], ['Serviços por R$ 1', m.servicosPorPessoal]]} />
        <ShareBars rows={m.pessoalComponents.map((r) => ({ label: r.label, cents: r.cents, ratio: r.ratio }))} />
        {m.pessoalExcluded.length > 0 && (
          <div className="rounded-xl bg-fundo p-3 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Fora do custo de pessoal (mostrados à parte)</p>
            <ul className="mt-1 space-y-0.5">{m.pessoalExcluded.map((r) => <li key={r.key} className="flex justify-between gap-3"><span>{r.label}</span><span className="font-semibold tabular-nums">{brl(r.cents)}</span></li>)}</ul>
          </div>
        )}
      </Section>

      <Section n={6} title="Tênis — parceria" icon={Trophy} comment={s?.tenis}>
        <Stats rows={[['Faturamento bruto', m.tenis.faturamento], ['Repasse ao parceiro', m.tenis.repasse], ['% repassado', m.tenis.pctRepasse], ['Repasse pelo contrato', m.tenis.esperado], ['Margem antes dos custos', m.tenis.margem]]} />
        <Note>Custo direto da modalidade (repasse de parceria) — não entra na folha.</Note>
      </Section>

      <Section n={7} title="Lanchonete" icon={UtensilsCrossed} comment={s?.lanchonete}>
        <Stats rows={[['Faturamento (PDV)', m.lanchonete.faturamento], ['Vendas', m.lanchonete.vendas], ['Ticket médio', m.lanchonete.ticketMedio], ['Vendas efetivas', m.lanchonete.vendasEfetivas], ['Compras para revenda', m.lanchonete.compras], ['Cancelamentos', m.lanchonete.cancelamentos], ['Estornos', m.lanchonete.estornos], ['Conta Assinada', m.lanchonete.contaAssinada], ['Conta Assinada não comercial', m.lanchonete.contaAssinadaNaoComercial]]} />
        {m.lanchonete.contaAssinadaPorClasse.length > 0 && <ShareBars rows={m.lanchonete.contaAssinadaPorClasse.map((r) => ({ label: `Conta Assinada · ${r.label}`, cents: r.cents, ratio: r.ratio }))} />}
        {m.productGroups.length > 0 && <ShareBars rows={m.productGroups.map((r) => ({ label: r.label, cents: r.cents, ratio: r.ratio }))} />}
      </Section>

      <Section n={8} title="Formas de pagamento" icon={CreditCard} comment={s?.formasPagamento}>
        <ShareBars rows={m.lanchonete.payments.map((r) => ({ label: r.label, cents: r.cents, ratio: r.ratio }))} />
        <Stats cols={2} rows={[['Soma das formas', m.lanchonete.paymentsSum]]} />
      </Section>

      <Section n={9} title="Ticket Funcionário" icon={Ticket} comment={s?.ticketFuncionario}>
        <Stats cols={2} rows={[['Ticket Funcionário', m.lanchonete.ticketFuncionario], ['% do faturamento do PDV', m.lanchonete.ticketFuncionarioPct]]} />
        <Note>Consumo interno / benefício dos funcionários — não é receita comercial.</Note>
      </Section>

      <Section n={10} title="Top 20 produtos" icon={ChefHat} comment={s?.topProdutos}>
        <Table head={['#', 'Produto', 'Grupo', 'Qtd.', 'Valor', '%']} align={['l', 'l', 'l', 'r', 'r', 'r']}
          rows={m.topProdutos.map((p) => [
            <span key="r" className={cn('grid size-6 place-items-center rounded-full text-[11px] font-bold', p.rank <= 3 ? 'bg-nacao text-white' : 'bg-fundo text-tinta-suave')}>{p.rank}</span>,
            <span key="n">{p.label}{p.interno && <span className="ml-1.5 rounded-full bg-atencao/10 px-1.5 py-0.5 text-[10px] font-semibold text-atencao">consumo interno</span>}</span>,
            p.groupLabel, p.quantidade ?? '—', brl(p.cents), pct(p.ratio)])} />
      </Section>

      <Section n={11} title="CMV" icon={BadgePercent} comment={s?.cmv}>
        <Stats cols={2} rows={[['CMV', m.cmv.valor], ['CMV ÷ faturamento da lanchonete', m.cmv.pct]]} />
        <Note>Metodologia: {m.cmv.metodo === 'real' ? 'CMV real (estoque inicial + compras − estoque final).' : m.cmv.metodo === 'estimado_compras' ? 'CMV ESTIMADO por compras do mês (sem inventário) — referência gerencial, não contábil.' : 'Dado não informado.'}</Note>
      </Section>

      <Section n={12} title="Reformas e investimentos" icon={Hammer} comment={s?.investimentos}>
        <Stats cols={2} rows={[['Investimentos do mês', m.investimentos.total]]} />
        {m.investimentos.items.length > 0 && <Table head={['Item', 'Classificação', 'Valor']} align={['l', 'l', 'r']} rows={m.investimentos.items.map((i) => [i.label, i.classification ?? '—', brl(i.cents)])} />}
        {m.financiamentos.length > 0 && <Table head={['Financiamentos e aportes', 'Valor']} align={['l', 'r']} rows={m.financiamentos.map((f) => [f.label, f.cents === null ? '—' : brl(f.cents)])} />}
      </Section>

      <Section n={13} title="Payout" icon={Crown} comment={s?.payout}>
        <Stats rows={[['Distribuição de lucros', m.payout.distribuicao], ['Antecipação', m.payout.antecipacao], ['Retiradas', m.payout.retiradas], ['Payout total', m.payout.total], ['Distribuição ÷ recebimentos', m.payout.distribuicaoPct], ['Payout total ÷ recebimentos', m.payout.totalPct]]} />
        <Note>Distribuição aos sócios — nunca despesa operacional.</Note>
      </Section>

      <Section n={14} title="Recebimentos × Pagamentos" icon={ArrowLeftRight} comment={s?.fluxo}>
        <FlowBar m={m} />
        <Note>Indicadores de fluxo financeiro — não são lucro nem prejuízo.</Note>
      </Section>

      <Section n={15} title="Posição de caixa" icon={Landmark} comment={s?.caixa}>
        <Stats cols={2} rows={[['Caixa disponível', m.caixa.disponivel], ['Previsto a receber (fora do caixa)', m.caixa.aReceber]]} />
        <Table head={['Conta', 'Tipo', 'Saldo', '%']} align={['l', 'l', 'r', 'r']} rows={m.caixa.accounts.map((c) => [c.label, c.kind === 'a_receber' ? 'A receber' : 'Disponível', brl(c.cents), c.ratio === null ? '—' : pct(c.ratio)])} />
      </Section>

      <Section n={16} title="Pontos positivos" icon={CheckCircle2}><Points items={a?.pontosPositivos} empty={noText} tone="positivo" /></Section>
      <Section n={17} title="Pontos de atenção" icon={AlertTriangle}>
        {checkList}
        <Points items={extraAttention} empty={a ? (m.checks.length ? '' : 'Sem pontos de atenção.') : noText} tone="atencao" />
      </Section>
      <Section n={18} title="Riscos" icon={ShieldAlert}><Points items={a?.riscos} empty={noText} tone="risco" /></Section>
      <Spotlight label="19 · Resumo para os sócios" text={a?.resumoSocios ?? noText} icon={PiggyBank} />
      <Spotlight label="20 · Conclusão executiva" text={a?.conclusao ?? noText} icon={Flag} />
      {footer}
    </>,
  );
}

/** Recebimentos → (−) pagamentos antes do payout → geração; (−) payout → diferença. Barras na mesma escala. */
function FlowBar({ m }: { m: Metrics }) {
  const rows: { label: string; ind: Ind; tone: string; sign?: string }[] = [
    { label: 'Recebimentos', ind: m.recebimentos, tone: 'from-nacao to-azul-claro' },
    { label: 'Pagamentos antes do payout', ind: m.fluxo.pagamentosAntesPayout, tone: 'from-tinta-suave to-tinta-fraca', sign: '−' },
    { label: 'Geração de caixa antes do payout', ind: m.fluxo.geracaoAntesPayout, tone: 'from-ciano to-azul-claro', sign: '=' },
    { label: 'Pagamentos totais', ind: m.pagamentos, tone: 'from-tinta-suave to-tinta-fraca' },
    { label: 'Recebimentos − pagamentos', ind: m.fluxo.diferenca, tone: 'from-navy to-nacao', sign: '=' },
  ];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.ind.value ?? 0)));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} title={r.ind.formula} className="min-w-0">
          <div className="flex items-baseline gap-2 text-sm">
            {r.sign && <span className="w-3 font-bold text-tinta-fraca">{r.sign}</span>}
            <span className="min-w-0 flex-1 truncate text-tinta">{r.label}</span>
            <span className={cn('font-titulo font-extrabold tabular-nums', r.ind.value === null ? 'font-corpo text-xs font-normal italic text-tinta-fraca' : r.ind.value < 0 ? 'text-critico' : 'text-navy')}>{indText(r.ind)}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-fundo">
            {r.ind.value !== null && <div className={cn('h-2.5 rounded-full bg-linear-to-r', r.ind.value < 0 ? 'from-critico to-critico/60' : r.tone)} style={{ width: `${Math.max(1.5, (Math.abs(r.ind.value) / max) * 100)}%` }} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
