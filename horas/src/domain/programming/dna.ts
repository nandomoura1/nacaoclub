import { WEEKDAYS } from '@/domain/dates';
import type { Session, SessionBlock } from './history';
import { MOVEMENT, classifyLoad, detectLoadKg, detectMovements, type LoadClass, type Modality, type MovementDef } from './movements';

/**
 * NAÇÃO PROGRAMMING DNA — assinatura de programação calculada do histórico:
 * estrutura da aula, time domains, formatos, frequência de movimentos por
 * modalidade, força (levantamentos, esquemas, intensidade), cargas e o
 * padrão da semana. Puro: recebe as sessões, devolve números.
 */

export type TimeDomain = 'sprint' | 'curto' | 'medio' | 'longo' | 'endurance';
export const TIME_DOMAINS: { id: TimeDomain; label: string; range: string }[] = [
  { id: 'sprint', label: 'Sprint', range: '0–5 min' },
  { id: 'curto', label: 'Curto', range: '6–10 min' },
  { id: 'medio', label: 'Médio', range: '11–20 min' },
  { id: 'longo', label: 'Longo', range: '21–30 min' },
  { id: 'endurance', label: 'Endurance', range: '30+ min' },
];
export function timeDomain(min: number): TimeDomain {
  if (min <= 5) return 'sprint';
  if (min <= 10) return 'curto';
  if (min <= 20) return 'medio';
  if (min <= 30) return 'longo';
  return 'endurance';
}

export const MODALITY_LABEL: Record<Modality, string> = { G: 'Ginástica', W: 'Levantamento (barra)', M: 'Monoestrutural', O: 'Objetos (KB/DB/medball)' };

export type WodFormat = 'For time' | 'AMRAP' | 'EMOM / a cada' | 'Intervalado' | 'Rounds' | 'For reps/load' | 'Outro';
export function wodFormat(b: Pick<SessionBlock, 'title'>): WodFormat {
  const t = b.title.toLowerCase();
  if (/amrap|as many/.test(t)) return 'AMRAP';
  if (/emom|e2mom|a cada|every \d|on a \d/.test(t)) return 'EMOM / a cada';
  if (/on\s*\/?\s*\d*'?\s*off|intervalad|interval|x \d+:00|rounds? de \d|rest/.test(t)) return 'Intervalado';
  if (/for time|\d+(-\d+){2,}|ladder|chipper/.test(t)) return 'For time';
  if (/for reps|for load|1rm|max/.test(t)) return 'For reps/load';
  if (/rounds?/.test(t)) return 'Rounds';
  return 'Outro';
}

/** Movimentos citados num bloco (título + itens). */
export function blockMovements(b: SessionBlock): { def: MovementDef; item: string }[] {
  const out: { def: MovementDef; item: string }[] = [];
  const sources = b.kind === 'FOR' ? [b.title, ...b.items] : b.items.length ? b.items : [b.title];
  for (const item of sources) for (const def of detectMovements(item)) out.push({ def, item });
  return out;
}

/** Esquema de força: repetições por série, intensidade (%), intervalo. */
export function strengthScheme(detail: string): { reps: number[]; pctMin: number | null; pctMax: number | null; intervalMin: number | null } {
  const d = detail.toLowerCase().replace(/,/g, '.');
  const reps: number[] = [];
  for (const [, sets, r] of d.matchAll(/(\d+)\s*x\s*(\d+)(?!\s*%)/g)) for (let i = 0; i < Math.min(Number(sets), 12); i++) reps.push(Number(r));
  for (const [seq] of d.matchAll(/\b\d+(?:\s*[-*]\s*\d+){2,}\+?/g)) {
    if (/%/.test(d.slice(d.indexOf(seq), d.indexOf(seq) + seq.length + 2))) continue;
    reps.push(...seq.split(/[-*]/).map((x) => Number.parseInt(x, 10)).filter((x) => x > 0 && x <= 30));
  }
  for (const [, r] of d.matchAll(/(?<![-*]\s?)\b(\d+)@\s?\d/g)) reps.push(Number(r)); // "5@75%"; não "6-6 @60%"
  for (const [, r] of d.matchAll(/%\s*x\s*(\d+)/g)) reps.push(Number(r));
  const pcts: number[] = [];
  for (const [, a, b] of d.matchAll(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*%/g)) pcts.push(Number(a), Number(b));
  for (const [, a] of d.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) pcts.push(Number(a));
  const valid = pcts.filter((p) => p >= 30 && p <= 110);
  const every = d.match(/a cada (\d+)'(?:\s*(\d+)")?|every (\d+):(\d+)/);
  const intervalMin = every
    ? every[1] ? Number(every[1]) + (every[2] ? Number(every[2]) / 60 : 0) : Number(every[3]) + Number(every[4]) / 60
    : /emom/.test(d) ? 1 : null;
  return { reps, pctMin: valid.length ? Math.min(...valid) : null, pctMax: valid.length ? Math.max(...valid) : null, intervalMin };
}

export type RepRange = '1–2' | '3–5' | '6–8' | '9+';
const repRange = (r: number): RepRange => (r <= 2 ? '1–2' : r <= 5 ? '3–5' : r <= 8 ? '6–8' : '9+');

type Count = Record<string, number>;
const inc = (c: Count, k: string, n = 1) => { c[k] = (c[k] ?? 0) + n; };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
const top = (c: Count, n = 99) => Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n);

export interface Dna {
  period: { from: string; to: string; sessions: number; weeks: number; specialDays: number };
  structure: { avgClassMin: number | null; declaredClassMin: number | null; avgWodMin: number | null; blockShare: Record<string, number>; avgBlockMin: Record<string, number | null>; wodsPerSession: number | null };
  timeDomains: { id: TimeDomain; label: string; range: string; count: number; share: number }[];
  formats: { format: WodFormat; count: number; share: number }[];
  partnerShare: number;
  namedWorkouts: { name: string; kind: 'benchmark' | 'hero' | 'open' | 'quarterfinals' | 'evento'; count: number }[];
  modality: {
    /** % dos WODs que têm ao menos um movimento de cada modalidade. */
    presence: Record<Modality, number>;
    /** Combinações (ex.: "G+M", "G+W+M") em % dos WODs. */
    mix: [string, number][];
    /** Nº de movimentos por WOD: single / couplet / triplet / 4+. */
    size: Record<'1' | '2' | '3' | '4+', number>;
  };
  movements: { id: string; name: string; modality: Modality; days: number; perWeek: number; inWod: number; inStrength: number; inSkill: number }[];
  strength: {
    sessionsShare: number;
    lifts: { id: string; name: string; family: string; blocks: number; perMonth: number }[];
    families: [string, number][];
    repRanges: [RepRange, number][];
    avgPctMin: number | null;
    avgPctMax: number | null;
    intervals: [string, number][];
    complexShare: number;
    withMetconShare: number;
    wodMinAfterStrength: number | null;
    wodMinWithoutStrength: number | null;
  };
  loading: { cls: LoadClass; count: number; share: number }[];
  weekdays: { weekday: number; label: string; sessions: number; strengthShare: number; avgWodMin: number | null; partnerShare: number; olyShare: number; topMovements: string[] }[];
}

const NAMED_KINDS = ['benchmark', 'hero', 'open', 'quarterfinals', 'evento'] as const;

export function computeDna(all: Session[]): Dna {
  const sessions = all.filter((s) => !s.special && s.blocks.length);
  const weeks = new Set(sessions.map((s) => mondayKey(s.date))).size || 1;
  const months = weeks / 4.345;
  const wods = sessions.flatMap((s) => s.blocks.filter((b) => b.kind === 'WOD').map((b) => ({ s, b })));

  // Estrutura da aula
  const blockShare: Count = {};
  const blockMin: Record<string, number[]> = {};
  const classMin: number[] = [];
  for (const s of sessions) {
    const kinds = new Set(s.blocks.map((b) => b.kind));
    for (const k of kinds) inc(blockShare, k);
    let total = 0;
    for (const b of s.blocks) if (b.minutes) { (blockMin[b.kind] ??= []).push(b.minutes); total += b.minutes; }
    if (total) classMin.push(total);
  }

  // Time domains e formatos
  const td: Count = {};
  const fmt: Count = {};
  let partner = 0;
  const named: Record<string, { kind: (typeof NAMED_KINDS)[number]; count: number }> = {};
  for (const { b } of wods) {
    if (b.minutes) inc(td, timeDomain(b.minutes));
    inc(fmt, wodFormat(b));
    if (b.tags.some((t) => t === 'partner' || t === 'trio')) partner++;
    for (const t of b.tags) {
      const [k, name] = t.split(':');
      if (name && (NAMED_KINDS as readonly string[]).includes(k!)) {
        const label = k === 'open' ? `Open ${name}` : k === 'quarterfinals' ? `Quarterfinals ${name}` : name.replace(/\b\w/g, (c) => c.toUpperCase());
        named[label] ??= { kind: k as (typeof NAMED_KINDS)[number], count: 0 };
        named[label].count++;
      }
    }
  }
  const tdTotal = Object.values(td).reduce((a, b) => a + b, 0);

  // Modalidades por WOD
  const presence: Count = {};
  const mix: Count = {};
  const size: Count = {};
  for (const { b } of wods) {
    const mv = blockMovements(b);
    const ids = new Set(mv.map((x) => x.def.id));
    if (!ids.size) continue;
    const mods = new Set(mv.map((x) => x.def.modality));
    for (const md of mods) inc(presence, md);
    inc(mix, ['W', 'G', 'O', 'M'].filter((x) => mods.has(x as Modality)).join('+'));
    inc(size, ids.size >= 4 ? '4+' : String(ids.size));
  }
  const wodsWithMv = Object.values(size).reduce((a, b) => a + b, 0) || 1;

  // Frequência de movimentos (dias em que aparecem)
  const days: Count = {}; const inWod: Count = {}; const inFor: Count = {}; const inSkill: Count = {};
  for (const s of sessions) {
    const seen = new Set<string>();
    for (const b of s.blocks) {
      if (b.kind === 'WU' || b.kind === 'MOB') continue;
      const ids = new Set(blockMovements(b).map((x) => x.def.id));
      for (const id of ids) {
        seen.add(id);
        if (b.kind === 'WOD' || b.kind === 'CARDIO') inc(inWod, id);
        else if (b.kind === 'FOR') inc(inFor, id);
        else inc(inSkill, id);
      }
    }
    for (const id of seen) inc(days, id);
  }

  // Força
  const forBlocks = sessions.flatMap((s) => s.blocks.filter((b) => b.kind === 'FOR').map((b) => ({ s, b })));
  const lifts: Count = {}; const families: Count = {}; const ranges: Count = {}; const intervals: Count = {};
  const pMin: number[] = []; const pMax: number[] = [];
  let complexes = 0;
  for (const { b } of forBlocks) {
    const mv = detectMovements(b.title);
    if (/complex|\+/i.test(b.title) || mv.length > 1) complexes++;
    for (const def of mv) { inc(lifts, def.id); inc(families, def.family); }
    const sc = strengthScheme(`${b.title} ${b.detail}`);
    for (const r of sc.reps) inc(ranges, repRange(r));
    if (sc.pctMin !== null) pMin.push(sc.pctMin);
    if (sc.pctMax !== null) pMax.push(sc.pctMax);
    if (sc.intervalMin) inc(intervals, sc.intervalMin === 1 ? 'EMOM (1\')' : `a cada ${fmtMin(sc.intervalMin)}`);
  }
  const strengthSessions = sessions.filter((s) => s.blocks.some((b) => b.kind === 'FOR'));
  const withMetcon = strengthSessions.filter((s) => s.blocks.some((b) => b.kind === 'WOD'));
  const wodMin = (list: Session[]) => avg(list.flatMap((s) => s.blocks.filter((b) => b.kind === 'WOD' && b.minutes).map((b) => b.minutes!)));

  // Cargas nos WODs (barra)
  const loads: Count = {};
  for (const { b } of wods) {
    for (const item of b.items) {
      const kg = detectLoadKg(item);
      if (!kg) continue;
      const def = detectMovements(item).find((d) => d.refKg);
      const cls = def ? classifyLoad(def, kg) : null;
      if (cls) inc(loads, cls);
    }
  }
  const loadTotal = Object.values(loads).reduce((a, b) => a + b, 0);

  // Semana
  const weekdays = [1, 2, 3, 4, 5, 6].map((wd) => {
    const list = sessions.filter((s) => s.weekday === wd);
    const wl = list.flatMap((s) => s.blocks.filter((b) => b.kind === 'WOD'));
    const mvCount: Count = {};
    for (const s of list) {
      const ids = new Set(s.blocks.filter((b) => b.kind === 'WOD' || b.kind === 'FOR').flatMap((b) => blockMovements(b).map((x) => x.def.id)));
      for (const id of ids) inc(mvCount, id);
    }
    const oly = list.filter((s) => s.blocks.some((b) => (b.kind === 'FOR' || b.kind === 'WOD') && blockMovements(b).some((x) => ['snatch', 'clean', 'jerk'].includes(x.def.family) && x.def.modality === 'W'))).length;
    return {
      weekday: wd,
      label: WEEKDAYS[wd - 1]!.long,
      sessions: list.length,
      strengthShare: pct(list.filter((s) => s.blocks.some((b) => b.kind === 'FOR')).length, list.length),
      avgWodMin: avg(wl.filter((b) => b.minutes).map((b) => b.minutes!)),
      partnerShare: pct(wl.filter((b) => b.tags.some((t) => t === 'partner' || t === 'trio')).length, wl.length),
      olyShare: pct(oly, list.length),
      topMovements: top(mvCount, 5).map(([id]) => MOVEMENT[id]!.name),
    };
  });

  const blockMinAvg = Object.fromEntries(Object.entries(blockMin).map(([k, v]) => [k, avg(v)]));
  return {
    period: { from: sessions[0]?.date ?? '', to: sessions.at(-1)?.date ?? '', sessions: sessions.length, weeks, specialDays: all.length - sessions.length },
    structure: {
      avgClassMin: avg(classMin),
      // Duração da aula declarada no planejamento (tag "#aula:48").
      declaredClassMin: avg(sessions.flatMap((s) => s.tags.filter((t) => t.startsWith('aula:')).map((t) => Number(t.slice(5))).filter((n) => n > 0))),
      avgWodMin: avg(wods.filter((w) => w.b.minutes).map((w) => w.b.minutes!)),
      blockShare: Object.fromEntries(Object.entries(blockShare).map(([k, v]) => [k, pct(v, sessions.length)])),
      avgBlockMin: blockMinAvg,
      wodsPerSession: avg(sessions.map((s) => s.blocks.filter((b) => b.kind === 'WOD').length)),
    },
    timeDomains: TIME_DOMAINS.map((d) => ({ ...d, count: td[d.id] ?? 0, share: pct(td[d.id] ?? 0, tdTotal) })),
    formats: top(fmt).map(([format, count]) => ({ format: format as WodFormat, count, share: pct(count, wods.length) })),
    partnerShare: pct(partner, wods.length),
    namedWorkouts: Object.entries(named).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    modality: {
      presence: { G: pct(presence.G ?? 0, wodsWithMv), W: pct(presence.W ?? 0, wodsWithMv), M: pct(presence.M ?? 0, wodsWithMv), O: pct(presence.O ?? 0, wodsWithMv) },
      mix: top(mix, 8).map(([k, v]) => [k, pct(v, wodsWithMv)]),
      size: { '1': pct(size['1'] ?? 0, wodsWithMv), '2': pct(size['2'] ?? 0, wodsWithMv), '3': pct(size['3'] ?? 0, wodsWithMv), '4+': pct(size['4+'] ?? 0, wodsWithMv) },
    },
    movements: top(days).map(([id, d]) => ({
      id, name: MOVEMENT[id]!.name, modality: MOVEMENT[id]!.modality, days: d,
      perWeek: Math.round((d / weeks) * 100) / 100, inWod: inWod[id] ?? 0, inStrength: inFor[id] ?? 0, inSkill: inSkill[id] ?? 0,
    })),
    strength: {
      sessionsShare: pct(strengthSessions.length, sessions.length),
      lifts: top(lifts).map(([id, n]) => ({ id, name: MOVEMENT[id]!.name, family: MOVEMENT[id]!.family, blocks: n, perMonth: Math.round((n / months) * 10) / 10 })),
      families: top(families).map(([k, v]) => [k, v]),
      repRanges: (['1–2', '3–5', '6–8', '9+'] as RepRange[]).map((r) => [r, ranges[r] ?? 0]),
      avgPctMin: avg(pMin),
      avgPctMax: avg(pMax),
      intervals: top(intervals, 6),
      complexShare: pct(complexes, forBlocks.length),
      withMetconShare: pct(withMetcon.length, strengthSessions.length),
      wodMinAfterStrength: wodMin(strengthSessions),
      wodMinWithoutStrength: wodMin(sessions.filter((s) => !s.blocks.some((b) => b.kind === 'FOR'))),
    },
    loading: (['leve', 'moderada', 'pesada', 'muito pesada'] as LoadClass[]).map((cls) => ({ cls, count: loads[cls] ?? 0, share: pct(loads[cls] ?? 0, loadTotal) })),
    weekdays,
  };
}

function fmtMin(m: number): string {
  const whole = Math.floor(m);
  const sec = Math.round((m - whole) * 60);
  return sec ? `${whole}'${String(sec).padStart(2, '0')}"` : `${whole}'`;
}

function mondayKey(d: string): string {
  const dt = new Date(`${d}T12:00:00Z`);
  const wd = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - wd);
  return dt.toISOString().slice(0, 10);
}

export interface DnaInsight { tone: 'assinatura' | 'lacuna'; title: string; text: string }

/** Leituras do coach: a assinatura (o que caracteriza a Nação) e as lacunas (o que a periodização deve corrigir). */
export function dnaInsights(d: Dna): DnaInsight[] {
  const out: DnaInsight[] = [];
  const td = Object.fromEntries(d.timeDomains.map((t) => [t.id, t.share]));
  const wd = Object.fromEntries(d.weekdays.map((w) => [w.weekday, w]));
  const mv = Object.fromEntries(d.movements.map((m) => [m.id, m]));
  const per = (id: string) => mv[id]?.perWeek ?? 0;
  const liftsMonth = (fam: string[]) => d.strength.lifts.filter((l) => fam.includes(l.family)).reduce((s, l) => s + l.perMonth, 0);

  out.push({ tone: 'assinatura', title: 'Aula em 4 tempos', text: `Warm-up ~${d.structure.avgBlockMin.WU ?? '–'}', específico/técnica ~${d.structure.avgBlockMin.ESP ?? '–'}', força ~${d.structure.avgBlockMin.FOR ?? '–'}' (em ${d.strength.sessionsShare}% das aulas) e um WOD de ~${d.structure.avgWodMin}'. ${d.strength.withMetconShare}% das sessões de força terminam em metcon.` });
  out.push({ tone: 'assinatura', title: 'Médio é a casa', text: `${td.medio}% dos WODs ficam entre 11 e 20 min, ${td.longo}% entre 21 e 30 e ${td.curto}% entre 6 e 10. Formatos: ${d.formats.slice(0, 3).map((f) => `${f.format} ${f.share}%`).join(', ')}.` });
  out.push({ tone: 'assinatura', title: 'Triplets e chippers', text: `${Math.round((d.modality.size['3'] + d.modality.size['4+']) * 10) / 10}% dos WODs têm 3 movimentos ou mais (${d.modality.size['4+']}% com 4+); couplets são ${d.modality.size['2']}%. Ginástica aparece em ${d.modality.presence.G}% dos WODs, monoestrutural em ${d.modality.presence.M}%, barra em ${d.modality.presence.W}%.` });
  out.push({ tone: 'assinatura', title: 'Força submáxima, a cada 2 minutos', text: `Séries de 3–5 reps dominam; intensidade típica ${d.strength.avgPctMin}–${d.strength.avgPctMax}% do RM; intervalo mais usado: ${d.strength.intervals[0]?.[0] ?? '–'}; ${d.strength.complexShare}% dos blocos são complexos de LPO.` });
  if (wd[1] && wd[6]) out.push({ tone: 'assinatura', title: 'A semana da Nação', text: `Força concentrada de segunda a quarta (~${wd[1].strengthShare}%), quinta puxada para o olímpico (${wd[4]?.olyShare ?? '–'}% com LPO), sexta mais curta (${wd[5]?.avgWodMin ?? '–'}') e sábado sem força e com mais treinos em dupla (${wd[6].partnerShare}%).` });

  if ((td.sprint ?? 0) < 5) out.push({ tone: 'lacuna', title: 'Sprint quase ausente', text: `Só ${td.sprint}% dos WODs têm até 5 min. Esforços curtíssimos e máximos (Grace, Isabel, sprints de 2–4') desenvolvem potência e são parte da variação CrossFit.` });
  const press = liftsMonth(['press']);
  if (press < 1) out.push({ tone: 'lacuna', title: 'Força de empurrar pouco treinada', text: `Blocos de força de press/push press/bench aparecem ${Math.round(press * 10) / 10}×/mês, contra ${Math.round(liftsMonth(['squat']) * 10) / 10}×/mês de agachamento e ${Math.round(liftsMonth(['hinge']) * 10) / 10}×/mês de levantamento terra.` });
  const pulls = per('pull-up') + per('c2b') + per('bar-muscle-up') + per('ring-muscle-up') + per('muscle-up') + per('rope-climb');
  const pushes = per('hspu') + per('push-up') + per('dip');
  if (pulls > pushes * 1.8) out.push({ tone: 'lacuna', title: 'Ginástica: puxa muito mais do que empurra', text: `Puxadas (pull-up, C2B, MU, corda) somam ${Math.round(pulls * 10) / 10}×/semana; empurrar (HSPU, push-up, dip) ${Math.round(pushes * 10) / 10}×/semana.` });
  if (per('ski') < 0.1) out.push({ tone: 'lacuna', title: 'Monoestrutural sem ski', text: `Corrida ${per('run')}×/sem, bike ${per('bike')}×/sem e remo ${per('row')}×/sem; ski praticamente não aparece (se houver equipamento, ele amplia a variação).` });
  if (per('back-squat') > 0 && (mv['back-squat']?.inWod ?? 0) < 3) out.push({ tone: 'lacuna', title: 'Back squat só no bloco de força', text: 'O back squat quase nunca aparece nos WODs. Numa periodização de agachamento, dá para levá-lo ao metcon em cargas moderadas.' });
  out.push({ tone: 'lacuna', title: 'Progressão de força sem continuidade', text: `Cada levantamento volta ~${Math.round(Math.max(...d.strength.lifts.slice(0, 3).map((l) => l.perMonth)) * 10) / 10}×/mês, com esquemas diferentes a cada vez. Falta um fio de progressão semana a semana, que é exatamente o que a ferramenta de periodização vai dar.` });
  // Números no padrão brasileiro (54,2%).
  return out.map((x) => ({ ...x, text: x.text.replace(/(\d)\.(\d)/g, '$1,$2') }));
}
