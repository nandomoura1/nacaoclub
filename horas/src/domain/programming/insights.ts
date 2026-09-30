import type { Session } from './history';
import { blockMovements, dnaInsights, type Dna, type DnaInsight } from './dna';
import { loadPair } from './calculator';
import type { volumeBaseline } from './volume';

/**
 * Diagnóstico por modalidade: o que caracteriza a programação (assinatura) e
 * o que o histórico mostra pouco (lacunas). CrossFit usa as regras de
 * dna.ts; Funcional e Hyrox têm as suas.
 */

type Baseline = ReturnType<typeof volumeBaseline>;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const num = (n: number | null | undefined) => String(n ?? '–');
const comma = (list: DnaInsight[]) => list.map((x) => ({ ...x, text: x.text.replace(/(\d)\.(\d)/g, '$1,$2') }));

/** % das aulas (não especiais) em que o movimento aparece em qualquer bloco. */
export function sessionShare(sessions: Session[], ids: string[]): number {
  const regular = sessions.filter((s) => !s.special);
  const hit = regular.filter((s) => s.blocks.some((b) => blockMovements(b).some((m) => ids.includes(m.def.id))));
  return pct(hit.length, regular.length);
}

/** % dos itens de WOD com movimento que trazem carga escrita (ex.: "16/24kg"). */
export function loadRegistered(sessions: Session[]): number {
  let items = 0, loaded = 0;
  for (const s of sessions) for (const b of s.blocks) {
    if (b.kind !== 'WOD') continue;
    for (const it of b.items) {
      if (!blockMovements({ ...b, items: [it] }).some((m) => m.def.modality === 'O' || m.def.modality === 'W')) continue;
      items++;
      // "KB 16/24kg", "Plate 10/15", "Sled 100/150": par de pesos que não é a quantidade do item.
      const body = it.replace(/^\s*\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?\s*(m|cal|x)?\b/i, '');
      if (loadPair(it) || /\d+\s*kg/i.test(it) || /\b\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?\b(?!\s*(cal|m)\b)/i.test(body)) loaded++;
    }
  }
  return pct(loaded, items);
}

/** As 8 estações da prova HYROX, na ordem oficial, + a corrida. */
export const HYROX_STATIONS: { id: string; label: string; race: string; ids: string[] }[] = [
  { id: 'run', label: 'Corrida', race: '8 × 1 km', ids: ['run', 'shuttle-run'] },
  { id: 'ski', label: 'SkiErg', race: '1.000 m', ids: ['ski'] },
  { id: 'sled-push', label: 'Sled push', race: '50 m', ids: ['sled'] },
  { id: 'sled-pull', label: 'Sled pull', race: '50 m', ids: ['sled-pull'] },
  { id: 'bbj', label: 'Burpee broad jump', race: '80 m', ids: ['burpee-broad-jump'] },
  { id: 'row', label: 'Remo', race: '1.000 m', ids: ['row'] },
  { id: 'carry', label: 'Farmers carry', race: '200 m', ids: ['carry'] },
  { id: 'lunge', label: 'Sandbag lunges', race: '100 m', ids: ['db-lunge', 'lunge'] },
  { id: 'wall-ball', label: 'Wall balls', race: '100 reps', ids: ['wall-ball'] },
];

export function hyroxCoverage(sessions: Session[]) {
  return HYROX_STATIONS.map((st) => ({ ...st, share: sessionShare(sessions, st.ids) }));
}

function funcionalInsights(d: Dna, sessions: Session[], base: Baseline): DnaInsight[] {
  const f = (name: string) => d.formats.find((x) => x.format === name)?.share ?? 0;
  const td = (id: string) => d.timeDomains.find((x) => x.id === id)?.share ?? 0;
  const circuit = f('EMOM / a cada') + f('Intervalado');
  const longShare = Math.round((td('longo') + td('endurance')) * 10) / 10;
  const shortShare = Math.round((td('sprint') + td('curto')) * 10) / 10;
  const core = sessionShare(sessions, ['sit-up', 'core-hold', 'bird-dog', 'mountain-climber', 't2b', 'k2e']);
  const topObj = d.movements.filter((m) => m.modality === 'O').slice(0, 3).map((m) => m.name.toLowerCase());
  const push = base.metrics.push.mean, pull = base.metrics.pull.mean;
  const loads = loadRegistered(sessions);
  const out: DnaInsight[] = [
    { tone: 'assinatura', title: 'Circuito é a casa', text: `${circuit.toFixed(1)}% dos WODs são EMOM ou intervalados; for time fica em ${f('For time')}% e AMRAP em ${f('AMRAP')}%.` },
    { tone: 'assinatura', title: 'Aula longa e contínua', text: `${longShare}% dos WODs passam de 20 min (WOD médio ${num(d.structure.avgWodMin)}'). Aula planejada de ${num(d.structure.declaredClassMin)}' em média.` },
    { tone: 'assinatura', title: 'Corpo todo com objetos', text: `Objetos em ${d.modality.presence.O}% dos WODs (${topObj.join(', ')}), monoestrutural em ${d.modality.presence.M}%; ${d.modality.size['4+']}% dos WODs têm 4 movimentos ou mais.` },
    { tone: 'assinatura', title: 'Core em quase toda aula', text: `${core}% das aulas têm core (abdominais, prancha, perdigueiro, escalador): ~${base.metrics.core.mean} reps de core por semana.` },
    { tone: 'assinatura', title: 'Aquecimento e específico sempre', text: `Warm-up em ${d.structure.blockShare.WU ?? 0}% das aulas (~${num(d.structure.avgBlockMin.WU)}') e específico em ${d.structure.blockShare.ESP ?? 0}% (~${num(d.structure.avgBlockMin.ESP)}'), passando exercício por exercício.` },
  ];
  if ((d.structure.blockShare.FOR ?? 0) < 10) out.push({ tone: 'lacuna', title: 'Força estruturada quase ausente', text: `Só ${d.structure.blockShare.FOR ?? 0}% das aulas têm bloco de força. Um bloco curto de força (agachamento, terra, empurrar) 1–2× por semana daria progressão mensurável.` });
  if (shortShare < 15) out.push({ tone: 'lacuna', title: 'Poucos esforços curtos', text: `Só ${shortShare}% dos WODs têm até 10 min. Tiros curtos e intensos variam o estímulo da aula longa.` });
  if (pull && push / pull > 1.4) out.push({ tone: 'lacuna', title: 'Empurra mais do que puxa', text: `~${push} reps de empurrar por semana contra ~${pull} de puxar (remadas, puxadas). Mais remada TRX/argola equilibra o ombro.` });
  if (loads < 40) out.push({ tone: 'lacuna', title: 'Carga pouco registrada', text: `Só ${loads}% dos exercícios com implemento trazem o peso escrito (ex.: "KB 16/24kg"). Sem o peso, a tonelagem e a progressão de carga não aparecem.` });
  return comma(out);
}

function hyroxInsights(d: Dna, sessions: Session[], base: Baseline): DnaInsight[] {
  const cov = hyroxCoverage(sessions);
  const run = cov.find((c) => c.id === 'run')!;
  const stations = cov.filter((c) => c.id !== 'run').sort((a, b) => b.share - a.share);
  const td = (id: string) => d.timeDomains.find((x) => x.id === id)?.share ?? 0;
  const perClass = base.weeks ? (base.metrics.runM.mean / Math.max(1, base.minSessions) / 1000).toFixed(1) : null;
  const out: DnaInsight[] = [
    { tone: 'assinatura', title: 'Corrida em quase toda aula', text: `${run.share}% das aulas têm corrida${perClass ? ` (~${perClass} km por aula na semana típica)` : ''}. É a base da prova: 8 km entre as estações.` },
    { tone: 'assinatura', title: 'Resistência é o estímulo', text: `${(td('longo') + td('endurance')).toFixed(1)}% dos WODs passam de 20 min (WOD médio ${num(d.structure.avgWodMin)}'); EMOM/a cada ${d.formats.find((x) => x.format === 'EMOM / a cada')?.share ?? 0}% e for time ${d.formats.find((x) => x.format === 'For time')?.share ?? 0}%.` },
    { tone: 'assinatura', title: 'Estações mais treinadas', text: stations.slice(0, 3).map((s) => `${s.label} ${s.share}%`).join(', ') + ' das aulas.' },
    { tone: 'assinatura', title: 'Treino compromissado', text: `${d.modality.mix.find(([k]) => k === 'G+O+M')?.[1] ?? 0}% dos WODs misturam corrida/erg, objetos e peso corporal: correr cansado, como na prova.` },
  ];
  const weak = stations.filter((s) => s.share < 20);
  if (weak.length) out.push({ tone: 'lacuna', title: 'Estações pouco treinadas', text: `${weak.map((s) => `${s.label} (${s.share}%)`).join(', ')} das aulas. Na prova cada estação pesa igual.` });
  const sandbag = sessionShare(sessions, ['db-lunge']), lunge = sessionShare(sessions, ['lunge']);
  if (lunge > sandbag * 2) out.push({ tone: 'lacuna', title: 'Lunge sem carga', text: `Lunge aparece em ${lunge}% das aulas, mas com sandbag/DB só em ${sandbag}%. Na prova são 100 m com sandbag.` });
  const push = sessionShare(sessions, ['sled']), pull = sessionShare(sessions, ['sled-pull']);
  if (push > pull * 2) out.push({ tone: 'lacuna', title: 'Sled pull atrás do push', text: `Sled push em ${push}% das aulas, sled pull em ${pull}%. O pull é a estação que mais quebra a pegada.` });
  const loads = loadRegistered(sessions);
  if (loads < 40) out.push({ tone: 'lacuna', title: 'Pesos da prova pouco registrados', text: `Só ${loads}% dos exercícios com implemento trazem o peso. Registrar peso de sled, wall ball e sandbag (Open/Pro) permite medir progressão.` });
  return comma(out);
}

export function modalityInsights(slug: string, d: Dna, sessions: Session[], base: Baseline): DnaInsight[] {
  if (slug === 'crossfit') return dnaInsights(d);
  if (slug === 'funcional') return funcionalInsights(d, sessions, base);
  if (slug === 'hyrox') return hyroxInsights(d, sessions, base);
  return [];
}
