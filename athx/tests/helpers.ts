import type {
  Category,
  EventSettings,
  Team,
  Wod1Result,
  Wod2Result,
  Wod3Result,
} from '@/types/domain';
import { DEFAULT_SETTINGS } from '@/types/domain';

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

export function w1(teamId: string, loads: number[], over: Partial<Wod1Result> = {}): Wod1Result {
  const [sp1 = null, sp2 = null, bs1 = null, bs2 = null, dl1 = null, dl2 = null] = loads;
  return {
    teamId,
    strictPressAthlete1: sp1,
    strictPressAthlete2: sp2,
    backSquatAthlete1: bs1,
    backSquatAthlete2: bs2,
    deadliftAthlete1: dl1,
    deadliftAthlete2: dl2,
    status: 'PUBLISHED',
    ...over,
  };
}

export function w2(
  teamId: string,
  runKm: number | null,
  bikeKm: number | null,
  over: Partial<Wod2Result> = {},
): Wod2Result {
  return { teamId, runKm, bikeKm, status: 'PUBLISHED', ...over };
}

export function w3(
  teamId: string,
  timeSeconds: number | null,
  completed = true,
  over: Partial<Wod3Result> = {},
): Wod3Result {
  return {
    teamId,
    timeSeconds,
    completed,
    volumeCompleted: null,
    status: 'PUBLISHED',
    ...over,
  };
}

export function settings(over: Partial<EventSettings> = {}): EventSettings {
  return { ...DEFAULT_SETTINGS, ...over };
}
