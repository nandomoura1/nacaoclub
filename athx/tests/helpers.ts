import type { Category, EventSettings, Team } from '@/types/domain';
import { DEFAULT_SETTINGS } from '@/types/domain';
import type { ProvaResult, Wod, WodEntry } from '@/types/wod';
import { WODS_SETEMBRO } from '@/lib/evento/setembro';

/**
 * Ajudantes dos testes.
 *
 * O evento de setembro serve de cenário padrão porque é um evento REAL e
 * completo: provas por atleta, provas calculadas, direções diferentes e um
 * workout com CAP. Um motor que acerta nele acerta em eventos mais simples.
 */

export const WODS: Wod[] = WODS_SETEMBRO;

export function team(n: number, over: Partial<Team> = {}): Team {
  return {
    id: `team-${n}`,
    eventId: 'event-1',
    teamNumber: n,
    teamName: `Dupla ${String(n).padStart(2, '0')}`,
    category: 'MISTA' as Category,
    athlete1: `Atleta ${n}A`,
    athlete2: `Atleta ${n}B`,
    battery: n % 2 === 0 ? 2 : 1,
    status: 'ATIVA',
    ...over,
  };
}

/** Busca uma prova pelo código em qualquer WOD do cenário. */
export function prova(codigo: string, wods: readonly Wod[] = WODS) {
  for (const wod of wods) {
    const p = wod.provas.find((x) => x.codigo === codigo);
    if (p) return p;
  }
  throw new Error(`prova ${codigo} não existe no cenário`);
}

export function wodDe(codigo: string, wods: readonly Wod[] = WODS): Wod {
  for (const wod of wods) {
    if (wod.provas.some((x) => x.codigo === codigo)) return wod;
  }
  throw new Error(`prova ${codigo} não existe no cenário`);
}

export function wodNumero(numero: number, wods: readonly Wod[] = WODS): Wod {
  const w = wods.find((x) => x.numero === numero);
  if (!w) throw new Error(`WOD ${numero} não existe no cenário`);
  return w;
}

/** Homologação de uma dupla num WOD. */
export function entry(
  numeroDoWod: number,
  teamId: string,
  over: Partial<WodEntry> = {},
  wods: readonly Wod[] = WODS,
): WodEntry {
  return {
    wodId: wodNumero(numeroDoWod, wods).id,
    teamId,
    status: 'PUBLISHED',
    concluiu: true,
    volume: null,
    ...over,
  };
}

/** Um valor lançado numa prova comum. */
export function val(
  codigo: string,
  teamId: string,
  valor: number | null,
  wods: readonly Wod[] = WODS,
): ProvaResult {
  return {
    provaId: prova(codigo, wods).id,
    teamId,
    valorAtleta1: null,
    valorAtleta2: null,
    valor,
  };
}

/** Um valor lançado numa prova por atleta (as cargas). */
export function dupla(
  codigo: string,
  teamId: string,
  a1: number | null,
  a2: number | null,
  wods: readonly Wod[] = WODS,
): ProvaResult {
  return {
    provaId: prova(codigo, wods).id,
    teamId,
    valorAtleta1: a1,
    valorAtleta2: a2,
    valor: null,
  };
}

/**
 * Atalho do WOD 1: as seis cargas de uma dupla em uma chamada.
 * Ordem: press 1, press 2, squat 1, squat 2, deadlift 1, deadlift 2.
 */
export function cargas(teamId: string, loads: readonly (number | null)[]): ProvaResult[] {
  const [sp1 = null, sp2 = null, bs1 = null, bs2 = null, dl1 = null, dl2 = null] = loads;
  return [
    dupla('1A', teamId, sp1, sp2),
    dupla('1B', teamId, bs1, bs2),
    dupla('1C', teamId, dl1, dl2),
  ];
}

/** Atalho do WOD 2: corrida e bike. */
export function distancias(
  teamId: string,
  runKm: number | null,
  bikeKm: number | null,
): ProvaResult[] {
  return [val('2A', teamId, runKm), val('2B', teamId, bikeKm)];
}

/** Atalho do WOD 3: tempo, se concluiu e o volume parcial. */
export function tempo(
  teamId: string,
  segundos: number | null,
  concluiu = true,
  volume: number | null = null,
): { entry: WodEntry; result: ProvaResult } {
  return {
    entry: entry(3, teamId, { concluiu, volume }),
    result: val('3A', teamId, segundos),
  };
}

export function settings(over: Partial<EventSettings> = {}): EventSettings {
  return { ...DEFAULT_SETTINGS, ...over };
}

/**
 * Monta a entrada do motor a partir de atalhos, preenchendo as homologações
 * que o teste não citou. Sem isto, cada teste repetiria vinte linhas de
 * `entry(...)` que não têm nada a ver com o que ele quer provar.
 */
export function cenario(args: {
  teams: readonly Team[];
  wod1?: ProvaResult[];
  wod2?: ProvaResult[];
  wod3?: { entry: WodEntry; result: ProvaResult }[];
  entries?: WodEntry[];
  settings?: EventSettings;
  wods?: Wod[];
}) {
  const wods = args.wods ?? WODS;
  const results: ProvaResult[] = [...(args.wod1 ?? []), ...(args.wod2 ?? [])];
  const entries: WodEntry[] = [...(args.entries ?? [])];

  const temEntrada = (numero: number, teamId: string) =>
    entries.some((e) => e.wodId === wodNumero(numero, wods).id && e.teamId === teamId);

  for (const r of args.wod1 ?? []) {
    if (!temEntrada(1, r.teamId)) entries.push(entry(1, r.teamId, {}, wods));
  }
  for (const r of args.wod2 ?? []) {
    if (!temEntrada(2, r.teamId)) entries.push(entry(2, r.teamId, {}, wods));
  }
  for (const t of args.wod3 ?? []) {
    results.push(t.result);
    if (!temEntrada(3, t.entry.teamId)) entries.push(t.entry);
  }

  return {
    teams: [...args.teams],
    wods,
    entries,
    results,
    settings: args.settings ?? settings(),
  };
}
