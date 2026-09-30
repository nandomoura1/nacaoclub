import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/card';
import { formatDateBR } from '@/domain/dates';
import { MODALITY_LABEL, computeDna, dnaInsights } from '@/domain/programming/dna';
import { parseHistory } from '@/domain/programming/history';
import { CROSSFIT_HISTORY } from '@/domain/programming/history.generated';
import type { Modality } from '@/domain/programming/movements';
import { cn } from '@/lib/cn';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';

export const metadata: Metadata = { title: 'DNA da Programação' };

// O histórico é estático (vem do repositório): calcula uma vez por build.
const DNA = computeDna(parseHistory(CROSSFIT_HISTORY));
const INSIGHTS = dnaInsights(DNA);

/** Barra horizontal de série única: rótulo, trilho e valor em texto (a cor não carrega identidade). */
function Bar({ label, value, max, text, hint }: { label: string; value: number; max: number; text: string; hint?: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 py-1 text-sm" title={hint ?? `${label}: ${text}`}>
      <span className="min-w-0 flex-1 truncate text-tinta">{label}</span>
      <span className="block h-2.5 w-[38%] shrink-0 rounded-full bg-fundo">
        <span className="block h-full rounded-full bg-nacao" style={{ width: `${w}%` }} />
      </span>
      <span className="w-16 shrink-0 text-right font-semibold tabular-nums text-tinta">{text}</span>
    </div>
  );
}

function Section({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
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
const numText = (n: number | null) => (n === null ? '–' : String(n).replace('.', ','));

export default async function DnaPage() {
  const principal = await requirePrincipal();
  if (!can(principal, 'workout.edit')) redirect('/hoje');
  const d = DNA;
  const byMod = (['G', 'W', 'M', 'O'] as Modality[]).map((mod) => ({ mod, list: d.movements.filter((m) => m.modality === mod).slice(0, 10) }));
  const maxWeek = Math.max(...d.movements.map((m) => m.perWeek));
  const maxLift = Math.max(...d.strength.lifts.map((l) => l.perMonth));
  const reps = d.strength.repRanges.reduce((s, [, n]) => s + n, 0);

  return (
    <>
      <PageHeader
        title="DNA da Programação · CrossFit"
        description={`A assinatura de programação da Nação, calculada de ${d.period.sessions} aulas (${formatDateBR(d.period.from)} a ${formatDateBR(d.period.to)}, ${d.period.weeks} semanas). É a base da periodização: o que manter e o que corrigir.`}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Aulas analisadas" value={String(d.period.sessions)} sub={`${d.period.weeks} semanas`} />
        <Stat label="WOD médio" value={`${numText(d.structure.avgWodMin)}'`} sub={`aula registrada ~${numText(d.structure.avgClassMin)}'`} />
        <Stat label="Aulas com força" value={pctText(d.strength.sessionsShare)} sub={`${pctText(d.strength.withMetconShare)} seguidas de metcon`} />
        <Stat label="WODs em dupla" value={pctText(d.partnerShare)} />
        <Stat label="Benchmarks/Heroes" value={String(d.namedWorkouts.filter((n) => n.kind !== 'evento').reduce((s, n) => s + n.count, 0))} sub="inclui Open e Quarterfinals" />
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        {(['assinatura', 'lacuna'] as const).map((tone) => (
          <Section key={tone} title={tone === 'assinatura' ? 'Assinatura da Nação' : 'Lacunas para a periodização'} sub={tone === 'assinatura' ? 'O que caracteriza a programação e deve ser preservado.' : 'O que o histórico mostra pouco. A ferramenta de periodização vai equilibrar.'}>
            <ul className="space-y-3">
              {INSIGHTS.filter((i) => i.tone === tone).map((i) => (
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
        <Section title="Time domains" sub="Duração do WOD (cap ou tempo previsto).">
          {d.timeDomains.map((t) => <Bar key={t.id} label={`${t.label} ${t.range.replace(' min', "'")}`} value={t.share} max={100} text={pctText(t.share)} hint={`${t.count} WODs`} />)}
        </Section>
        <Section title="Formatos" sub="Como o WOD é pontuado.">
          {d.formats.map((f) => <Bar key={f.format} label={f.format} value={f.share} max={100} text={pctText(f.share)} hint={`${f.count} WODs`} />)}
        </Section>
        <Section title="Tamanho do WOD" sub="Movimentos diferentes por WOD.">
          {([['1', 'Single'], ['2', 'Couplet'], ['3', 'Triplet'], ['4+', '4 ou mais']] as const).map(([k, label]) => (
            <Bar key={k} label={label} value={d.modality.size[k]} max={100} text={pctText(d.modality.size[k])} />
          ))}
        </Section>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Section title="Modalidades nos WODs" sub="% dos WODs com ao menos um movimento de cada modalidade.">
          {(['G', 'M', 'W', 'O'] as Modality[]).map((m) => <Bar key={m} label={MODALITY_LABEL[m]} value={d.modality.presence[m]} max={100} text={pctText(d.modality.presence[m])} />)}
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-tinta-suave">Combinações mais usadas</p>
          {d.modality.mix.slice(0, 5).map(([k, v]) => (
            <Bar key={k} label={k.split('+').map((x) => ({ G: 'Gin', W: 'Barra', M: 'Mono', O: 'Obj' })[x as Modality]).join(' + ')} value={v} max={100} text={pctText(v)} />
          ))}
        </Section>
        <Section title="Carga nos WODs" sub="Barra, relativa à carga moderada Rx de cada movimento (ex.: deadlift 100 kg, clean 61 kg, snatch 43 kg).">
          {d.loading.map((l) => <Bar key={l.cls} label={l.cls[0]!.toUpperCase() + l.cls.slice(1)} value={l.share} max={100} text={pctText(l.share)} hint={`${l.count} prescrições`} />)}
        </Section>
      </div>

      <h2 className="mb-2 mt-6 text-xl font-extrabold text-navy">Frequência de movimentos</h2>
      <p className="mb-3 text-sm text-tinta-suave">Vezes por semana em que o movimento aparece (WOD, força ou específico). Passe o mouse para ver onde aparece.</p>
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        {byMod.map(({ mod, list }) => (
          <Section key={mod} title={MODALITY_LABEL[mod]}>
            {list.map((m) => (
              <Bar key={m.id} label={m.name} value={m.perWeek} max={maxWeek} text={`${numText(m.perWeek)}/sem`} hint={`${m.name}: ${m.days} dias · WOD ${m.inWod} · força ${m.inStrength} · técnica/específico ${m.inSkill}`} />
            ))}
          </Section>
        ))}
      </div>

      <h2 className="mb-2 mt-6 text-xl font-extrabold text-navy">Força</h2>
      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <Section title="Levantamentos no bloco de força" sub="Blocos por mês." className="lg:col-span-2">
          {d.strength.lifts.slice(0, 12).map((l) => <Bar key={l.id} label={l.name} value={l.perMonth} max={maxLift} text={`${numText(l.perMonth)}/mês`} hint={`${l.blocks} blocos no período`} />)}
        </Section>
        <Section title="Esquema" sub="Repetições por série prescrita.">
          {d.strength.repRanges.map(([r, n]) => <Bar key={r} label={`${r} reps`} value={n} max={reps} text={pctText(Math.round((n / (reps || 1)) * 1000) / 10)} hint={`${n} séries`} />)}
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-tinta-suave">Intensidade típica</dt><dd className="text-right font-semibold">{numText(d.strength.avgPctMin)}–{numText(d.strength.avgPctMax)}%</dd>
            <dt className="text-tinta-suave">Intervalo mais usado</dt><dd className="text-right font-semibold">{d.strength.intervals[0]?.[0] ?? '–'}</dd>
            <dt className="text-tinta-suave">Complexos de LPO</dt><dd className="text-right font-semibold">{pctText(d.strength.complexShare)}</dd>
            <dt className="text-tinta-suave">WOD após força</dt><dd className="text-right font-semibold">{numText(d.strength.wodMinAfterStrength)}' <span className="text-tinta-suave">(sem: {numText(d.strength.wodMinWithoutStrength)}')</span></dd>
          </dl>
        </Section>
      </div>

      <Section title="A semana da Nação" sub="Padrão de cada dia no período analisado." className="mb-4">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-xs uppercase tracking-wide text-tinta-suave">
                <th className="py-2 pr-2">Dia</th><th className="px-2 text-right">Força</th><th className="px-2 text-right">LPO</th><th className="px-2 text-right">WOD médio</th><th className="px-2 text-right">Em dupla</th><th className="pl-2">Mais frequentes</th>
              </tr>
            </thead>
            <tbody>
              {d.weekdays.map((w) => (
                <tr key={w.weekday} className="border-b border-borda/60 last:border-0">
                  <td className="py-2 pr-2 font-bold text-navy">{w.label}</td>
                  <td className="px-2 text-right tabular-nums">{pctText(w.strengthShare)}</td>
                  <td className="px-2 text-right tabular-nums">{pctText(w.olyShare)}</td>
                  <td className="px-2 text-right tabular-nums">{numText(w.avgWodMin)}'</td>
                  <td className="px-2 text-right tabular-nums">{pctText(w.partnerShare)}</td>
                  <td className="pl-2 text-tinta-suave">{w.topMovements.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Benchmarks, Heroes e Open no histórico" className="mb-4">
        <div className="flex flex-wrap gap-2">
          {d.namedWorkouts.filter((n) => n.kind !== 'evento').map((n) => (
            <span key={n.name} className="rounded-full border border-borda px-3 py-1 text-sm">
              <b className="text-navy">{n.name}</b>{n.count > 1 && <span className="text-tinta-suave"> ×{n.count}</span>}
            </span>
          ))}
        </div>
      </Section>

      <p className="text-xs text-tinta-fraca">
        Fonte: planilhas e PDFs semanais do CrossFit (Drive), transcritos em data/historico-crossfit. Nos arquivos em que as colunas vinham misturadas, o dia da semana de cada bloco é aproximado; os totais por semana não mudam.
      </p>
    </>
  );
}
