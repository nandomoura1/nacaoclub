import { Card, PageHeader } from '@/components/ui/card';
import { WEEKDAYS, formatDateBR } from '@/domain/dates';
import { MODALITY_LABEL } from '@/domain/programming/dna';
import type { Modality } from '@/domain/programming/movements';
import { LEVELS, LEVEL_LOAD_SAMPLES, LEVEL_RATIO } from '@/domain/programming/taxonomy';
import { INTENSITY_CLASSES, WEEK_METRICS } from '@/domain/programming/volume';
import { cn } from '@/lib/cn';
import { getDnaReport } from '@/server/programming/dna-report';
import { TechnicalReport } from './TechnicalReport';

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
const numText = (n: number | null) => (n === null ? '–' : String(n).replace('.', ','));
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="mb-2 mt-6 text-xl font-extrabold text-navy">{children}</h2>;

export function DnaReport({ slug }: { slug: string }) {
  const r = getDnaReport(slug);
  const name = r.modality.name;
  if (r.empty) {
    return (
      <>
        <PageHeader title={`DNA da Programação · ${name}`} description={`A assinatura de programação de ${name}, aprendida do histórico de treinos da modalidade.`} />
        <Card className="p-6">
          <p className="font-bold text-navy">Aguardando o histórico de {name}.</p>
          <p className="mt-1 text-sm text-tinta-suave">
            Envie as planilhas ou documentos de programação de {name} (quanto mais semanas, melhor). O sistema segmenta as aulas, aprende a metodologia e mostra aqui o diagnóstico: estrutura da aula, formatos, movimentos, volume e lacunas. É a base da Geração de Treino por IA.
          </p>
        </Card>
      </>
    );
  }
  if (r.technical) return <TechnicalReport name={name} dna={r.dna} insights={r.insights} dataset={r.dataset} source={r.source} />;
  const { dna: d, base, model, coverage, byDay, insights, hyrox } = r;
  const crossfit = slug === 'crossfit';
  const byMod = (['G', 'W', 'M', 'O'] as Modality[])
    .map((mod) => ({ mod, list: d.movements.filter((m) => m.modality === mod).slice(0, 10) }))
    .filter((x) => x.list.length);
  const maxWeek = Math.max(...d.movements.map((m) => m.perWeek));
  const maxLift = Math.max(0, ...d.strength.lifts.map((l) => l.perMonth));
  const reps = d.strength.repRanges.reduce((s, [, n]) => s + n, 0);
  const hasStrength = d.strength.sessionsShare >= 10;
  const hasLoading = d.loading.some((l) => l.count > 0);
  const named = d.namedWorkouts.filter((n) => n.kind !== 'evento');
  const days = d.weekdays.filter((w) => w.sessions > 0);
  const covTotal = coverage.exato + coverage.estimado + coverage['sem-leitura'];
  const classMin = d.structure.declaredClassMin ?? (crossfit ? 55 : null);

  return (
    <>
      <PageHeader
        title={`DNA da Programação · ${name}`}
        description={`A assinatura de programação de ${name}, calculada de ${d.period.sessions} aulas (${formatDateBR(d.period.from)} a ${formatDateBR(d.period.to)}, ${d.period.weeks} semanas). É a base da periodização e da geração de treino: o que manter e o que corrigir.`}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Aulas analisadas" value={String(d.period.sessions)} sub={`${d.period.weeks} semanas`} />
        <Stat label="WOD médio" value={`${numText(d.structure.avgWodMin)}'`} sub={`blocos registrados ~${numText(d.structure.avgClassMin)}'${classMin ? ` · aula ${numText(classMin)}'` : ''}`} />
        {hasStrength
          ? <Stat label="Aulas com força" value={pctText(d.strength.sessionsShare)} sub={`${pctText(d.strength.withMetconShare)} seguidas de metcon`} />
          : <Stat label="Aulas com específico" value={pctText(d.structure.blockShare.ESP ?? 0)} sub={`~${numText(d.structure.avgBlockMin.ESP ?? null)}' antes do WOD`} />}
        <Stat label="WODs em dupla" value={pctText(d.partnerShare)} />
        {crossfit
          ? <Stat label="Benchmarks/Heroes" value={String(named.reduce((s, n) => s + n.count, 0))} sub="inclui Open e Quarterfinals" />
          : <Stat label="WODs com 4+ movimentos" value={pctText(d.modality.size['4+'])} sub={`${pctText(d.structure.blockShare.WOD ?? 0)} das aulas têm WOD`} />}
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        {(['assinatura', 'lacuna'] as const).map((tone) => (
          <Section key={tone} title={tone === 'assinatura' ? `Assinatura · ${name}` : 'Lacunas para a periodização'} sub={tone === 'assinatura' ? 'O que caracteriza a programação e deve ser preservado.' : 'O que o histórico mostra pouco. A periodização e a IA vão equilibrar.'}>
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

      {hyrox && (
        <Section title="Estações HYROX" sub="% das aulas que treinam cada estação da prova (formato oficial: 8 × 1 km de corrida intercalados com as estações)." className="mb-4">
          <div className="grid gap-x-8 lg:grid-cols-2">
            {hyrox.map((st) => <Bar key={st.id} label={`${st.label} · ${st.race}`} value={st.share} max={100} text={pctText(st.share)} />)}
          </div>
        </Section>
      )}

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
        <Section title="Modalidades nos WODs" sub="% dos WODs com ao menos um movimento de cada modalidade." className={hasLoading ? '' : 'lg:col-span-2'}>
          {(['G', 'M', 'W', 'O'] as Modality[]).map((m) => <Bar key={m} label={MODALITY_LABEL[m]} value={d.modality.presence[m]} max={100} text={pctText(d.modality.presence[m])} />)}
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-tinta-suave">Combinações mais usadas</p>
          {d.modality.mix.slice(0, 5).map(([k, v]) => (
            <Bar key={k} label={k.split('+').map((x) => ({ G: 'Gin', W: 'Barra', M: 'Mono', O: 'Obj' })[x as Modality]).join(' + ')} value={v} max={100} text={pctText(v)} />
          ))}
        </Section>
        {hasLoading && (
          <Section title="Carga nos WODs" sub="Barra, relativa à carga moderada Rx de cada movimento (ex.: deadlift 100 kg, clean 61 kg, snatch 43 kg).">
            {d.loading.map((l) => <Bar key={l.cls} label={l.cls[0]!.toUpperCase() + l.cls.slice(1)} value={l.share} max={100} text={pctText(l.share)} hint={`${l.count} prescrições`} />)}
          </Section>
        )}
      </div>

      <H2>Frequência de movimentos</H2>
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

      {hasStrength && (
        <>
          <H2>Força</H2>
          <div className="mb-4 grid gap-3 lg:grid-cols-3">
            <Section title="Levantamentos no bloco de força" sub="Blocos por mês." className="lg:col-span-2">
              {d.strength.lifts.slice(0, 12).map((l) => <Bar key={l.id} label={l.name} value={l.perMonth} max={maxLift} text={`${numText(l.perMonth)}/mês`} hint={`${l.blocks} blocos no período`} />)}
            </Section>
            <Section title="Esquema" sub="Repetições por série prescrita.">
              {d.strength.repRanges.map(([rr, n]) => <Bar key={rr} label={`${rr} reps`} value={n} max={reps} text={pctText(Math.round((n / (reps || 1)) * 1000) / 10)} hint={`${n} séries`} />)}
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <dt className="text-tinta-suave">Intensidade típica</dt><dd className="text-right font-semibold">{numText(d.strength.avgPctMin)}–{numText(d.strength.avgPctMax)}%</dd>
                <dt className="text-tinta-suave">Intervalo mais usado</dt><dd className="text-right font-semibold">{d.strength.intervals[0]?.[0] ?? '–'}</dd>
                <dt className="text-tinta-suave">Complexos de LPO</dt><dd className="text-right font-semibold">{pctText(d.strength.complexShare)}</dd>
                <dt className="text-tinta-suave">WOD após força</dt><dd className="text-right font-semibold">{numText(d.strength.wodMinAfterStrength)}' <span className="text-tinta-suave">(sem: {numText(d.strength.wodMinWithoutStrength)}')</span></dd>
              </dl>
            </Section>
          </div>
        </>
      )}

      <H2>Volume de referência</H2>
      <p className="mb-3 text-sm text-tinta-suave">
        Calculadora de movimentos aplicada à base: reps por padrão (thruster conta squat e push), metros, calorias, impacto e tonelagem, por atleta RX, em {base.weeks} semanas cheias ({base.minSessions}+ aulas). É a régua dos alertas: acima de +30% da média das últimas 4 semanas, ou do P90, a semana acende.
      </p>
      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <Section title={`Semana típica · ${name}`} sub="Por atleta RX. AMRAP, EMOM por tempo e intervalos são estimados pelo ritmo RX." className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borda text-left text-xs uppercase tracking-wide text-tinta-suave">
                  <th className="py-2 pr-3 font-semibold">Métrica</th>
                  <th className="px-2 py-2 text-right font-semibold">Média</th>
                  <th className="px-2 py-2 text-right font-semibold">P50</th>
                  <th className="px-2 py-2 text-right font-semibold">P75</th>
                  <th className="py-2 pl-2 text-right font-semibold">P90</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {WEEK_METRICS.filter((m) => base.metrics[m.id].mean > 0).map((m) => {
                  const x = base.metrics[m.id];
                  const f = (n: number) => n.toLocaleString('pt-BR');
                  return (
                    <tr key={m.id}>
                      <td className="py-1.5 pr-3 text-tinta">{m.label} <span className="text-xs text-tinta-fraca">{m.unit}</span></td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-tinta">{f(x.mean)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-tinta-suave">{f(x.p50)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-tinta-suave">{f(x.p75)}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums text-tinta-suave">{f(x.p90)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
        <div className="grid content-start gap-3">
          {crossfit && (
            <Section title="Carga por nível" sub="Proporção da carga RX, medida nas prescrições com as faixas.">
              {LEVELS.map((l) => (
                <div key={l.id} className="flex justify-between py-1 text-sm">
                  <span className="text-tinta">{l.label}</span>
                  <span className="font-semibold tabular-nums text-tinta">{Math.round(LEVEL_RATIO[l.id] * 100)}%{l.id === 'INICIANTE' ? ' *' : ''}</span>
                </div>
              ))}
              <p className="mt-2 text-xs text-tinta-fraca">Base: {LEVEL_LOAD_SAMPLES.length} prescrições (set–out/2026). * Iniciante não aparece na base: regra configurável.</p>
            </Section>
          )}
          <Section title="Leitura dos WODs" sub="Quanto do histórico a calculadora entende. Estimado = AMRAP e estações por tempo.">
            {(['exato', 'estimado', 'sem-leitura'] as const).map((k) => (
              <Bar key={k} label={k === 'sem-leitura' ? 'Sem leitura' : k === 'exato' ? 'Exato' : 'Estimado'} value={coverage[k]} max={covTotal} text={pctText(Math.round((coverage[k] / (covTotal || 1)) * 1000) / 10)} hint={`${coverage[k]} WODs`} />
            ))}
          </Section>
        </div>
      </div>

      <Section title="Intensidade por dia" sub={`Índice de intensidade (carga, densidade, duração, complexidade) calibrado na base de ${name}: os cortes seguem a distribuição 15% · 49% · 30% · 6%. Limites: ${model.thresholds.map(numText).join(' · ')}.`} className="mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-xs uppercase tracking-wide text-tinta-suave">
                <th className="py-2 pr-3 font-semibold">Dia</th>
                {INTENSITY_CLASSES.map((c) => <th key={c} className="px-2 py-2 text-right font-semibold">{c}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {byDay.map(([wd, row]) => {
                const n = INTENSITY_CLASSES.reduce((a, c) => a + row[c], 0);
                return (
                  <tr key={wd}>
                    <td className="py-1.5 pr-3 font-bold text-tinta">{WEEKDAYS[wd - 1]!.long}</td>
                    {INTENSITY_CLASSES.map((c) => <td key={c} className="px-2 py-1.5 text-right tabular-nums text-tinta">{pctText(Math.round((row[c] / n) * 1000) / 10)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={`A semana · ${name}`} sub="Padrão de cada dia no período analisado." className="mb-4">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-xs uppercase tracking-wide text-tinta-suave">
                <th className="py-2 pr-2">Dia</th>
                <th className="px-2 text-right">Aulas</th>
                {hasStrength && <th className="px-2 text-right">Força</th>}
                {crossfit && <th className="px-2 text-right">LPO</th>}
                <th className="px-2 text-right">WOD médio</th><th className="px-2 text-right">Em dupla</th><th className="pl-2">Mais frequentes</th>
              </tr>
            </thead>
            <tbody>
              {days.map((w) => (
                <tr key={w.weekday} className="border-b border-borda/60 last:border-0">
                  <td className="py-2 pr-2 font-bold text-navy">{w.label}</td>
                  <td className="px-2 text-right tabular-nums">{w.sessions}</td>
                  {hasStrength && <td className="px-2 text-right tabular-nums">{pctText(w.strengthShare)}</td>}
                  {crossfit && <td className="px-2 text-right tabular-nums">{pctText(w.olyShare)}</td>}
                  <td className="px-2 text-right tabular-nums">{numText(w.avgWodMin)}'</td>
                  <td className="px-2 text-right tabular-nums">{pctText(w.partnerShare)}</td>
                  <td className="pl-2 text-tinta-suave">{w.topMovements.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {named.length > 0 && (
        <Section title="Benchmarks, Heroes e Open no histórico" className="mb-4">
          <div className="flex flex-wrap gap-2">
            {named.map((n) => (
              <span key={n.name} className="rounded-full border border-borda px-3 py-1 text-sm">
                <b className="text-navy">{n.name}</b>{n.count > 1 && <span className="text-tinta-suave"> ×{n.count}</span>}
              </span>
            ))}
          </div>
        </Section>
      )}

      <p className="text-xs text-tinta-fraca">Fonte: {r.source}</p>
    </>
  );
}
