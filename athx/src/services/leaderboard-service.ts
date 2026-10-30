import 'server-only';

import { EVENT_SLUG, IS_DEMO } from '@/lib/env';
import { getServerSupabase } from '@/lib/supabase/server';
import {
  DEMO_AGENDA,
  DEMO_ENTRIES,
  DEMO_EVENT,
  DEMO_RESULTS,
  DEMO_SETTINGS,
  DEMO_TEAMS,
  DEMO_WODS,
} from '@/lib/demo/fixtures';
import type { Snapshot } from './snapshot';
import type {
  Battery,
  Category,
  EventSettings,
  ResultStatus,
  Team,
  TeamStatus,
} from '@/types/domain';
import type { Prova, ProvaResult, Wod, WodBloco, WodEntry } from '@/types/wod';
import { ehTieBreaker, parseTieBreaker, TIE_BREAKER_PADRAO } from '@/types/domain';

/* -------------------------------------------------------------------------
   Linhas cruas do Postgres -> tipos do domínio.
   Um lugar só faz essa tradução; o resto do app nunca vê snake_case.
   ------------------------------------------------------------------------- */

/**
 * Junta o que estiver guardado nos campos de desempate e NÃO for um código
 * conhecido. É o texto que a organização escreveu na época em que o campo só
 * registrava a regra — serve para o formulário dizer "você tinha escrito
 * isto" em vez de apagar em silêncio.
 */
function textoLegado(valores: readonly (string | null | undefined)[]): string | null {
  const sobra = valores
    .map((v) => (v ?? '').trim())
    .filter((v) => v.length > 0 && !ehTieBreaker(v.toUpperCase()));
  return sobra.length > 0 ? sobra.join(' · ') : null;
}

interface WodRow {
  id: string;
  event_id: string;
  numero: number;
  nome: string;
  formato: string | null;
  cap_segundos: number | null;
  resumo: string | null;
  permite_cap: boolean;
  regras: string[] | null;
  pendencias: string[] | null;
  ordem: number;
}

interface BlocoRow {
  wod_id: string;
  ordem: number;
  janela: string;
  movimento: string;
  detalhe: string | null;
  masculino: string | null;
  feminino: string | null;
}

interface ProvaRow {
  id: string;
  wod_id: string;
  codigo: string;
  descricao: string;
  criterio: string | null;
  unidade: Prova['unidade'];
  direcao: Prova['direcao'];
  origem: Prova['origem'];
  por_atleta: boolean;
  componentes: string[] | null;
  pontua: boolean;
  ordem: number;
}

interface AgendaRow {
  id: string;
  ordem: number;
  hora: string;
  titulo: string;
  detalhe: string | null;
  itens: string[] | null;
  nota: string | null;
  wod_id: string | null;
  bateria: number | null;
  destaque: boolean;
}

interface EntryRow {
  wod_id: string;
  team_id: string;
  status: ResultStatus;
  concluiu: boolean | null;
  volume: number | string | null;
}

interface ResultRow {
  prova_id: string;
  team_id: string;
  valor_atleta_1: number | string | null;
  valor_atleta_2: number | string | null;
  valor: number | string | null;
}

/** Numérico do Postgres chega como string quando passa de certa precisão. */
function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Junta as três consultas num objeto Wod completo, com blocos e provas. */
function montarWods(wods: WodRow[], blocos: BlocoRow[], provas: ProvaRow[]): Wod[] {
  return wods.map((w) => ({
    id: w.id,
    eventId: w.event_id,
    numero: w.numero,
    nome: w.nome,
    formato: w.formato,
    capSegundos: w.cap_segundos,
    resumo: w.resumo,
    permiteCap: w.permite_cap,
    regras: w.regras ?? [],
    pendencias: w.pendencias ?? [],
    ordem: w.ordem,
    blocos: blocos
      .filter((b) => b.wod_id === w.id)
      .map<WodBloco>((b) => ({
        ordem: b.ordem,
        janela: b.janela,
        movimento: b.movimento,
        detalhe: b.detalhe,
        masculino: b.masculino,
        feminino: b.feminino,
      })),
    provas: provas
      .filter((p) => p.wod_id === w.id)
      .map<Prova>((p) => ({
        id: p.id,
        wodId: p.wod_id,
        codigo: p.codigo,
        descricao: p.descricao,
        criterio: p.criterio,
        unidade: p.unidade,
        direcao: p.direcao,
        origem: p.origem,
        porAtleta: p.por_atleta,
        componentes: p.componentes ?? [],
        pontua: p.pontua,
        ordem: p.ordem,
      })),
  }));
}

interface TeamRow {
  id: string;
  event_id: string;
  team_number: number;
  team_name: string;
  category: Category;
  athlete_1: string;
  athlete_2: string;
  battery: number;
  status: TeamStatus;
}




function toTeam(r: TeamRow): Team {
  return {
    id: r.id,
    eventId: r.event_id,
    teamNumber: r.team_number,
    teamName: r.team_name,
    category: r.category,
    athlete1: r.athlete_1,
    athlete2: r.athlete_2,
    battery: (r.battery === 2 ? 2 : 1) as Battery,
    status: r.status,
  };
}




/* ------------------------------------------------------------------------- */

function demoSnapshot(): Snapshot {
  return {
    event: DEMO_EVENT,
    settings: DEMO_SETTINGS,
    teams: DEMO_TEAMS,
    wods: DEMO_WODS,
    agenda: DEMO_AGENDA,
    entries: DEMO_ENTRIES,
    results: DEMO_RESULTS,
    lastUpdate: new Date().toISOString(),
    demo: true,
  };
}

/**
 * Busca o estado completo do evento.
 * Em modo demo devolve os dados fictícios sem tocar em rede.
 */
export async function getSnapshot(): Promise<Snapshot> {
  if (IS_DEMO) return demoSnapshot();

  const supabase = await getServerSupabase();

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, name, date, status')
    .eq('slug', EVENT_SLUG)
    .maybeSingle();

  if (eventError || !event) {
    throw new Error(
      `Evento "${EVENT_SLUG}" não encontrado no Supabase. Rode supabase/seed.sql. ` +
        (eventError?.message ?? ''),
    );
  }

  const [settingsRes, teamsRes, wodsRes, blocosRes, provasRes, entriesRes, resultsRes, agendaRes] =
    await Promise.all([
    supabase.from('event_settings').select('*').eq('event_id', event.id).maybeSingle(),
    supabase
      .from('teams')
      .select('id, event_id, team_number, team_name, category, athlete_1, athlete_2, battery, status')
      .eq('event_id', event.id)
      .order('team_number'),
    supabase.from('wods').select('*').eq('event_id', event.id).order('ordem'),
    supabase.from('wod_blocos').select('*').order('ordem'),
    supabase.from('provas').select('*').order('ordem'),
    supabase.from('wod_entries').select('*').eq('event_id', event.id),
    supabase.from('prova_results').select('*').eq('event_id', event.id),
    supabase.from('agenda').select('*').eq('event_id', event.id).order('ordem'),
    ]);

  const s = settingsRes.data;
  const settings: EventSettings = {
    tiePointsMode: s?.tie_points_mode ?? 'COMPETITION',
    dnfPolicy: s?.dnf_policy ?? 'PENDING_DEFINITION',
    // Campo 1 sem valor reconhecível cai na regra do evento (melhor
    // colocação no WOD 3); 2 e 3 continuam vazios até alguém escolher.
    tieBreaker1: parseTieBreaker(s?.tie_breaker_1, TIE_BREAKER_PADRAO),
    tieBreaker2: parseTieBreaker(s?.tie_breaker_2),
    tieBreaker3: parseTieBreaker(s?.tie_breaker_3),
    // Texto livre que sobrou da época em que o campo só registrava a regra.
    // Guardado para o formulário poder mostrá-lo; o motor nunca usa.
    tieBreakerLegado: textoLegado([
      s?.tie_breaker_1,
      s?.tie_breaker_2,
      s?.tie_breaker_3,
    ]),
    baterias: s?.baterias ?? 2,
    liveMode: s?.live_mode ?? true,
    maintenanceMode: s?.maintenance_mode ?? false,
  };

  const wods = montarWods(
    (wodsRes.data ?? []) as WodRow[],
    (blocosRes.data ?? []) as BlocoRow[],
    (provasRes.data ?? []) as ProvaRow[],
  );

  const entries: WodEntry[] = ((entriesRes.data ?? []) as EntryRow[]).map((r) => ({
    wodId: r.wod_id,
    teamId: r.team_id,
    status: r.status,
    concluiu: r.concluiu ?? false,
    volume: num(r.volume),
  }));

  const results: ProvaResult[] = ((resultsRes.data ?? []) as ResultRow[]).map((r) => ({
    provaId: r.prova_id,
    teamId: r.team_id,
    valorAtleta1: num(r.valor_atleta_1),
    valorAtleta2: num(r.valor_atleta_2),
    valor: num(r.valor),
  }));

  const stamps = [...(entriesRes.data ?? []), ...(resultsRes.data ?? [])]
    .map((r) => (r as { updated_at?: string }).updated_at)
    .filter((v): v is string => Boolean(v));

  const lastUpdate = stamps.length
    ? stamps.reduce((a, b) => (a > b ? a : b))
    : new Date().toISOString();

  return {
    event: {
      id: event.id,
      name: event.name,
      date: event.date,
      status: event.status,
      liveMode: settings.liveMode,
      maintenanceMode: settings.maintenanceMode,
    },
    settings,
    teams: (teamsRes.data ?? []).map((r) => toTeam(r as TeamRow)),
    wods,
    agenda: ((agendaRes.data ?? []) as AgendaRow[]).map((a) => ({
      id: a.id,
      ordem: a.ordem,
      hora: a.hora,
      titulo: a.titulo,
      detalhe: a.detalhe,
      itens: a.itens ?? [],
      nota: a.nota,
      wodId: a.wod_id,
      bateria: a.bateria,
      destaque: a.destaque,
    })),
    entries,
    results,
    lastUpdate,
    demo: false,
  };
}
