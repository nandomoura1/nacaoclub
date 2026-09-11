import 'server-only';

import { IS_DEMO } from '@/lib/env';
import { getServerSupabase } from '@/lib/supabase/server';

/**
 * Auditoria (§23) — quem mudou o quê, quando, de qual valor para qual.
 *
 * As entradas são geradas por gatilho no Postgres, não pela aplicação: mesmo
 * uma alteração feita direto no painel do Supabase aparece aqui.
 */

export interface AuditEntry {
  id: string;
  createdAt: string;
  action: string;
  author: string;
  wodNumber: number | null;
  teamNumber: number | null;
  teamName: string | null;
  /** Descrição pronta para leitura: "bike 8.45 → 8.75". */
  changes: { campo: string; de: string; para: string }[];
}

/** Campos escritos pelo motor de cálculo — ruído, não história. */
const DERIVADOS = new Set([
  'rank', 'points', 'tied', 'needs_decision', 'total_points', 'total_load', 'total_km',
  'rank_run', 'points_run', 'rank_bike', 'points_bike', 'rank_total', 'points_total',
  'updated_at', 'updated_by', 'created_at', 'created_by', 'id', 'event_id', 'team_id',
]);

const ROTULOS: Record<string, string> = {
  strict_press_athlete_1: 'Strict Press A1',
  strict_press_athlete_2: 'Strict Press A2',
  back_squat_athlete_1: 'Back Squat A1',
  back_squat_athlete_2: 'Back Squat A2',
  deadlift_athlete_1: 'Deadlift A1',
  deadlift_athlete_2: 'Deadlift A2',
  run_km: 'Corrida (km)',
  bike_km: 'Bike (km)',
  time_seconds: 'Tempo (s)',
  completed: 'Concluiu',
  volume_completed: 'Volume',
  status: 'Status',
  team_name: 'Nome da dupla',
  category: 'Categoria',
  athlete_1: 'Atleta 1',
  athlete_2: 'Atleta 2',
  battery: 'Bateria',
};

interface FeedRow {
  id: string;
  created_at: string;
  action: string;
  author: string | null;
  wod_number: number | null;
  team_number: number | null;
  team_name: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
}

function diff(
  antes: Record<string, unknown> | null,
  depois: Record<string, unknown> | null,
): AuditEntry['changes'] {
  if (!depois) return [];
  const campos = new Set([...Object.keys(antes ?? {}), ...Object.keys(depois)]);
  const mudancas: AuditEntry['changes'] = [];

  for (const campo of campos) {
    if (DERIVADOS.has(campo)) continue;
    const de = antes?.[campo];
    const para = depois[campo];
    if (String(de ?? '') === String(para ?? '')) continue;

    mudancas.push({
      campo: ROTULOS[campo] ?? campo,
      de: de === null || de === undefined ? '—' : String(de),
      para: para === null || para === undefined ? '—' : String(para),
    });
  }

  return mudancas;
}

export async function getAuditFeed(limite = 40): Promise<AuditEntry[]> {
  if (IS_DEMO) return [];

  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from('athx_audit_feed')
      .select('*')
      .limit(limite);

    if (error || !data) return [];

    return (data as FeedRow[]).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      action: row.action,
      author: row.author ?? 'sistema',
      wodNumber: row.wod_number,
      teamNumber: row.team_number,
      teamName: row.team_name,
      changes: diff(row.old_value, row.new_value),
    }));
  } catch {
    // Auditoria indisponível não pode derrubar a tela de conferência.
    return [];
  }
}
