import { z } from 'zod';
import { CATEGORIES, TEAM_STATUSES, DNF_POLICIES, TIE_POINTS_MODES } from '@/types/domain';
import { isValidRunKm } from '@/lib/scoring/wod2';
import { parseTimeToSeconds } from '@/lib/time';
import { WOD3_CAP_SECONDS } from '@/lib/scoring/wod3';

/**
 * Campo numérico do formulário: aceita string com vírgula, número, null ou
 * ausente. Vazio significa "não lançado", não zero — a diferença importa:
 * zero é um resultado, ausente é uma lacuna.
 */
const numeroOpcional = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  });

/** Carga: número positivo, aceita vírgula decimal. Vazio = não lançado. */
const carga = numeroOpcional.refine((v) => v === null || (v >= 0 && v <= 999), {
  message: 'Carga deve estar entre 0 e 999 kg',
});

export const teamSchema = z.object({
  id: z.string().uuid().optional(),
  teamNumber: z.coerce.number().int().min(1, 'Número da dupla é obrigatório').max(999),
  teamName: z.string().trim().min(1, 'Nome da dupla é obrigatório').max(80),
  category: z.enum(CATEGORIES),
  athlete1: z.string().trim().max(80).default(''),
  athlete2: z.string().trim().max(80).default(''),
  battery: z.coerce.number().int().refine((v) => v === 1 || v === 2, 'Bateria deve ser 1 ou 2'),
  status: z.enum(TEAM_STATUSES),
});

export const wod1RowSchema = z.object({
  teamId: z.string().min(1),
  strictPressAthlete1: carga,
  strictPressAthlete2: carga,
  backSquatAthlete1: carga,
  backSquatAthlete2: carga,
  deadliftAthlete1: carga,
  deadliftAthlete2: carga,
});

/**
 * WOD 2 — distância livre.
 *
 * A troca entre os atletas acontece a cada 500 m, mas isso é regra de pista,
 * cobrada pelo juiz. O AMRAP para no minuto 22 no meio de um trecho, então a
 * distância final pode ser qualquer uma — 2,410 km é um resultado legítimo.
 */
export const wod2RowSchema = z.object({
  teamId: z.string().min(1),
  runKm: numeroOpcional.refine((v) => v === null || isValidRunKm(v), {
    message: 'Distância de corrida inválida',
  }),
  bikeKm: numeroOpcional.refine((v) => v === null || (v >= 0 && v <= 99), {
    message: 'Distância de bike inválida',
  }),
});

/** WOD 3 — o operador digita MM:SS; a conversão para segundos é nossa (§21). */
export const wod3RowSchema = z
  .object({
    teamId: z.string().min(1),
    time: z.string().trim().default(''),
    completed: z.boolean().default(false),
    volumeCompleted: numeroOpcional.refine((v) => v === null || v >= 0, {
      message: 'Volume inválido',
    }),
  })
  .transform((row) => {
    // Não concluiu: grava o CAP (20:00), como manda a especificação.
    const timeSeconds = row.completed ? parseTimeToSeconds(row.time) : WOD3_CAP_SECONDS;
    return { ...row, timeSeconds };
  })
  .refine((row) => !row.completed || row.timeSeconds !== null, {
    message: 'Informe o tempo no formato MM:SS (ex.: 14:32)',
    path: ['time'],
  })
  .refine((row) => row.timeSeconds === null || row.timeSeconds <= WOD3_CAP_SECONDS, {
    message: 'O tempo não pode ultrapassar o CAP de 20:00',
    path: ['time'],
  });

export const settingsSchema = z.object({
  tiePointsMode: z.enum(TIE_POINTS_MODES),
  dnfPolicy: z.enum(DNF_POLICIES),
  tieBreaker1: z.string().trim().max(200).nullable(),
  tieBreaker2: z.string().trim().max(200).nullable(),
  tieBreaker3: z.string().trim().max(200).nullable(),
  liveMode: z.boolean(),
  maintenanceMode: z.boolean(),
});

export type TeamInput = z.input<typeof teamSchema>;
export type Wod1RowInput = z.input<typeof wod1RowSchema>;
export type Wod2RowInput = z.input<typeof wod2RowSchema>;
export type Wod3RowInput = z.input<typeof wod3RowSchema>;
export type SettingsInput = z.input<typeof settingsSchema>;
