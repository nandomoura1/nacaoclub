import 'server-only';

import { EVENT_SLUG, IS_DEMO } from '@/lib/env';
import { getServerSupabase } from '@/lib/supabase/server';
import {
  DEMO_EVENT,
  DEMO_SETTINGS,
  DEMO_TEAMS,
  DEMO_WOD1,
  DEMO_WOD2,
  DEMO_WOD3,
} from '@/lib/demo/fixtures';
import type { Snapshot } from './snapshot';
import type {
  Battery,
  Category,
  EventSettings,
  ResultStatus,
  Team,
  TeamStatus,
  Wod1Result,
  Wod2Result,
  Wod3Result,
} from '@/types/domain';
import { parseTieBreaker, TIE_BREAKERS, TIE_BREAKER_PADRAO } from '@/types/domain';

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
  const codigos = TIE_BREAKERS as readonly string[];
  const sobra = valores
    .map((v) => (v ?? '').trim())
    .filter((v) => v.length > 0 && !codigos.includes(v.toUpperCase()));
  return sobra.length > 0 ? sobra.join(' · ') : null;
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

interface Wod1Row {
  team_id: string;
  strict_press_athlete_1: number | null;
  strict_press_athlete_2: number | null;
  back_squat_athlete_1: number | null;
  back_squat_athlete_2: number | null;
  deadlift_athlete_1: number | null;
  deadlift_athlete_2: number | null;
  status: ResultStatus;
  updated_at: string;
}

interface Wod2Row {
  team_id: string;
  run_km: number | null;
  bike_km: number | null;
  status: ResultStatus;
  updated_at: string;
}

interface Wod3Row {
  team_id: string;
  time_seconds: number | null;
  completed: boolean;
  volume_completed: number | null;
  status: ResultStatus;
  updated_at: string;
}

const num = (v: number | string | null): number | null =>
  v === null || v === undefined ? null : Number(v);

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

function toWod1(r: Wod1Row): Wod1Result {
  return {
    teamId: r.team_id,
    strictPressAthlete1: num(r.strict_press_athlete_1),
    strictPressAthlete2: num(r.strict_press_athlete_2),
    backSquatAthlete1: num(r.back_squat_athlete_1),
    backSquatAthlete2: num(r.back_squat_athlete_2),
    deadliftAthlete1: num(r.deadlift_athlete_1),
    deadliftAthlete2: num(r.deadlift_athlete_2),
    status: r.status,
  };
}

function toWod2(r: Wod2Row): Wod2Result {
  return {
    teamId: r.team_id,
    runKm: num(r.run_km),
    bikeKm: num(r.bike_km),
    status: r.status,
  };
}

function toWod3(r: Wod3Row): Wod3Result {
  return {
    teamId: r.team_id,
    timeSeconds: num(r.time_seconds),
    completed: r.completed,
    volumeCompleted: num(r.volume_completed),
    status: r.status,
  };
}

/* ------------------------------------------------------------------------- */

function demoSnapshot(): Snapshot {
  return {
    event: DEMO_EVENT,
    settings: DEMO_SETTINGS,
    teams: DEMO_TEAMS,
    wod1: DEMO_WOD1,
    wod2: DEMO_WOD2,
    wod3: DEMO_WOD3,
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

  const [settingsRes, teamsRes, w1Res, w2Res, w3Res] = await Promise.all([
    supabase.from('event_settings').select('*').eq('event_id', event.id).maybeSingle(),
    supabase
      .from('teams')
      .select('id, event_id, team_number, team_name, category, athlete_1, athlete_2, battery, status')
      .eq('event_id', event.id)
      .order('team_number'),
    supabase.from('wod1_results').select('*').eq('event_id', event.id),
    supabase.from('wod2_results').select('*').eq('event_id', event.id),
    supabase.from('wod3_results').select('*').eq('event_id', event.id),
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
    liveMode: s?.live_mode ?? true,
    maintenanceMode: s?.maintenance_mode ?? false,
  };

  const wod1 = (w1Res.data ?? []).map((r) => toWod1(r as Wod1Row));
  const wod2 = (w2Res.data ?? []).map((r) => toWod2(r as Wod2Row));
  const wod3 = (w3Res.data ?? []).map((r) => toWod3(r as Wod3Row));

  const stamps = [
    ...(w1Res.data ?? []),
    ...(w2Res.data ?? []),
    ...(w3Res.data ?? []),
  ]
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
    wod1,
    wod2,
    wod3,
    lastUpdate,
    demo: false,
  };
}
