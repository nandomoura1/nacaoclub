import { Card, PageHeader } from '@/components/ui/card';
import type { TechnicalDataset, TechnicalDna, TechnicalInsight } from '@/domain/programming/technical';
import { fundamentalLabel, fundamentalsOf, ruleKind } from '@/domain/programming/technical';
import { cn } from '@/lib/cn';

/** Relatório do DNA de modalidades técnicas (Futevôlei, Base Forte): planos de aula, não WODs. */

/** Rótulos daqui são longos (regras, etapas): texto em cima, trilho embaixo. */
function Bar({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="py-1.5 text-sm" title={`${label}: ${text}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 text-tinta">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-tinta">{text}</span>
      </div>
      <span className="mt-1 block h-2 rounded-full bg-fundo">
        <span className="block h-full rounded-full bg-nacao" style={{ width: `${w}%` }} />
      </span>
    </div>
  );
}

function Section({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('min-w-0 p-4 sm:p-5', className)}>
      <h2 className="text-lg font-extrabold text-navy">{title}</h2>
      {sub && <p className="mb-3 text-xs text-tinta-suave">{sub}</p>}
      <div className={sub ? '' : 'mt-3'}>{children}</div>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums text-navy">{value}</p>
      {sub && <p className="text-xs text-tinta-suave">{sub}</p>}
    </Card>
  );
}

const pctText = (n: number) => `${String(n).replace('.', ',')}%`;
const LEVEL: Record<string, string> = { aprendiz_D_C: 'Aprendiz (D/C)', intermediario: 'Intermediário', avancado: 'Avançado' };
const DAYS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

export function TechnicalReport({ name, dna: d, insights, dataset, source }: {
  name: string; dna: TechnicalDna; insights: TechnicalInsight[]; dataset: TechnicalDataset; source: string;
}) {
  const m = d.methodology;
  const maxF = Math.max(1, ...d.fundamentals.map((f) => f.count));
  const days = DAYS.filter((day) => dataset.sessoes.some((s) => s.dia === day));
  // Ciclo: as sessões vêm em ordem; cada semana = uma volta pelos dias de aula.
  const weeks: typeof dataset.sessoes[] = [];
  if (days.length) for (let i = 0; i < dataset.sessoes.length; i += days.length) weeks.push(dataset.sessoes.slice(i, i + days.length));
  const main = d.blocks.filter((b) => b.count >= 2);

  return (
    <>
      <PageHeader
        title={`DNA da Programação · ${name}`}
        description={`A assinatura da ${m.nome}, aprendida de ${d.sessions} planos de aula. É a base da geração de aulas: o que manter e o que corrigir.`}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Planos de aula" value={String(d.sessions)} sub={weeks.length ? `${weeks.length} semanas de ciclo` : undefined} />
        <Stat label="Etapas de progressão" value={String(d.progression.avgSteps).replace('.', ',')} sub="por aula, do simples ao jogo" />
        <Stat label="Terminam em jogo" value={pctText(d.progression.endsInGame)} sub="construção, ataque ou jogo" />
        <Stat label="Fundamentos" value={String(d.fundamentals.length)} sub={`principal: ${d.fundamentals[0]?.label.toLowerCase() ?? '–'}`} />
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        {(['assinatura', 'lacuna'] as const).map((tone) => (
          <Section key={tone} title={tone === 'assinatura' ? `Assinatura · ${name}` : 'Lacunas'} sub={tone === 'assinatura' ? 'O que caracteriza a metodologia e deve ser preservado.' : 'O que a base mostra pouco. A geração de aulas vai equilibrar.'}>
            <ul className="space-y-3">
              {insights.filter((i) => i.tone === tone).map((i) => (
                <li key={i.title} className={cn('border-l-4 pl-3', tone === 'assinatura' ? 'border-nacao' : 'border-atencao')}>
                  <p className="font-bold text-tinta">{i.title}</p>
                  <p className="text-sm text-tinta-suave">{i.text}</p>
                </li>
              ))}
            </ul>
          </Section>
        ))}
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <Section title="Princípios da metodologia" className="lg:col-span-2">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-tinta">
            {m.principios.map((p) => <li key={p}>{p}</li>)}
          </ol>
        </Section>
        <Section title="Entrega do professor">
          <p className="text-sm font-bold text-navy">{m.padrao_entrega_professor.feedback.join(' → ')}</p>
          <p className="mt-2 text-sm text-tinta-suave">{m.padrao_entrega_professor.uso_nome_aluno}</p>
          <p className="mt-2 text-sm text-tinta-suave">{m.padrao_entrega_professor.energia_alta}</p>
          <dl className="mt-3 space-y-1.5 text-sm">
            {Object.entries(m.padrao_entrega_professor.adaptacao_niveis).map(([k, v]) => (
              <div key={k}><dt className="font-semibold text-tinta">{LEVEL[k] ?? k}</dt><dd className="text-tinta-suave">{v}</dd></div>
            ))}
          </dl>
        </Section>
      </div>

      {weeks.length > 0 && (
        <Section title="Ciclo de aulas" sub="Tema de cada aula, na ordem da base. Cada semana é dedicada a uma fase da metodologia." className="mb-4">
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-borda text-left text-xs uppercase tracking-wide text-tinta-suave">
                  <th className="py-2 pr-2">Semana</th>
                  {days.map((day) => <th key={day} className="px-2">{day.replace('-feira', '')}</th>)}
                </tr>
              </thead>
              <tbody>
                {weeks.map((w, i) => (
                  <tr key={i} className="border-b border-borda/60 align-top last:border-0">
                    <td className="py-2 pr-2">
                      <p className="font-bold text-navy">{i + 1}</p>
                      <p className="text-xs text-tinta-suave">{[...new Set(w.map((s) => s.fase))].join(' / ')}</p>
                    </td>
                    {days.map((day) => {
                      const s = w.find((x) => x.dia === day);
                      return <td key={day} className="px-2 py-2 text-tinta">{s ? s.tema : '–'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <Section title="Fundamentos" sub="% das aulas que trabalham o fundamento (tema ou foco).">
          {d.fundamentals.map((f) => <Bar key={f.id} label={f.label} value={f.count} max={maxF} text={pctText(f.share)} />)}
          {d.missing.length > 0 && <p className="mt-2 text-xs text-tinta-fraca">Sem aula na base: {d.missing.map(fundamentalLabel).join(', ')}.</p>}
        </Section>
        {d.phases.length > 0
          ? (
            <Section title="Fases da metodologia" sub="% das aulas em cada fase.">
              {d.phases.map((p) => <Bar key={p.phase} label={p.phase} value={p.share} max={100} text={pctText(p.share)} />)}
            </Section>
          )
          : (
            <Section title="Estrutura da aula" sub={`Etapas que se repetem nos planos${main.some((b) => b.avgMin) ? ' (minutos quando registrados)' : ''}.`}>
              {main.map((b) => <Bar key={b.name} label={`${b.name}${b.avgMin ? ` · ${b.avgMin}'` : ''}`} value={b.count} max={d.sessions} text={pctText(Math.round((b.count / d.sessions) * 1000) / 10)} />)}
            </Section>
          )}
        <Section title="Jogo condicionado" sub="Como o jogo final força o fundamento do dia.">
          {d.rules.map(([r, n]) => <Bar key={r} label={r} value={n} max={d.sessions} text={pctText(Math.round((n / d.sessions) * 1000) / 10)} />)}
        </Section>
      </div>

      <Section title="Foco do professor" sub="Pontos de correção mais citados nos planos." className="mb-4">
        <div className="flex flex-wrap gap-2">
          {d.coaching.map(([c, n]) => (
            <span key={c} className="rounded-full border border-borda px-3 py-1 text-sm"><b className="text-navy">{c}</b>{n > 1 && <span className="text-tinta-suave"> ×{n}</span>}</span>
          ))}
        </div>
      </Section>

      <h2 className="mb-2 mt-6 text-xl font-extrabold text-navy">Biblioteca de aulas</h2>
      <p className="mb-3 text-sm text-tinta-suave">Os planos que o sistema aprendeu. Cada um vira modelo para a geração de aulas: objetivo, progressão, jogo e conceito.</p>
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        {dataset.sessoes.map((s) => (
          <Card key={s.id} className="p-4">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xs font-bold text-tinta-fraca">{s.id}</span>
              <h3 className="font-extrabold text-navy">{s.tema}</h3>
              {(s.fase || s.dia) && <span className="text-xs text-tinta-suave">{[s.fase, s.dia?.replace('-feira', '')].filter(Boolean).join(' · ')}</span>}
            </div>
            <p className="mt-1 text-sm text-tinta">{s.objetivo}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-tinta-suave">Progressão</p>
            <p className="text-sm text-tinta">{s.progressao.join(' → ')}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-tinta-suave">Jogo · {ruleKind(s).toLowerCase()}</p>
            <p className="text-sm text-tinta">{s.dinamica_jogo ? `${s.dinamica_jogo.descricao} ${s.dinamica_jogo.regra}` : s.mini_jogo}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {fundamentalsOf(s).map((f) => <span key={f} className="rounded bg-nacao/10 px-1.5 py-0.5 text-[11px] font-semibold text-nacao">{fundamentalLabel(f)}</span>)}
              {s.conceito && <span className="text-xs italic text-tinta-suave">“{s.conceito}”</span>}
            </div>
          </Card>
        ))}
      </div>

      <p className="text-xs text-tinta-fraca">Fonte: {source}</p>
    </>
  );
}
