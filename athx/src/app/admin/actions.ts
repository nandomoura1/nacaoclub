'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { EVENT_SLUG, IS_DEMO } from '@/lib/env';
import { getServerSupabase } from '@/lib/supabase/server';
import {
  settingsSchema,
  teamSchema,
  wod1RowSchema,
  wod2RowSchema,
  wod3RowSchema,
} from '@/lib/validation';
import type { ResultStatus, WodNumber } from '@/types/domain';

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Erros por linha: teamId -> mensagem. Deixa o juiz ver onde errou. */
  fieldErrors?: Record<string, string>;
}

const DEMO_BLOCK: ActionResult = {
  ok: false,
  message:
    'Modo demonstração: não há banco para gravar. Configure o Supabase e defina NEXT_PUBLIC_DEMO_MODE=false.',
};

/**
 * Toda ação passa por aqui antes de escrever.
 * A checagem existe para dar erro claro na interface — a barreira que
 * realmente protege é o RLS no Postgres (§35).
 */
async function requireAdmin() {
  const supabase = await getServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Sessão expirada. Entre novamente.');

  const { data: isAdmin } = await supabase.rpc('athx_is_admin');
  if (isAdmin !== true) {
    throw new Error(
      'Sua conta não está em admin_users. Peça para a organização liberar o acesso.',
    );
  }

  const { data: event } = await supabase
    .from('events')
    .select('id')
    .eq('slug', EVENT_SLUG)
    .maybeSingle();

  if (!event) throw new Error(`Evento "${EVENT_SLUG}" não encontrado. Rode supabase/seed.sql.`);

  return { supabase, user, eventId: event.id as string };
}

/**
 * Traduz erros do banco para linguagem de quem está operando o evento.
 *
 * O gatilho que protege resultado travado devolve uma mensagem que cita o
 * nome de uma função SQL — informação inútil para quem está com um juiz
 * esperando do lado. Aqui vira uma instrução acionável.
 */
function traduzir(mensagem: string): string {
  if (mensagem.includes('LOCKED')) {
    return 'Este resultado está TRAVADO e por isso não pode ser alterado. Vá em Conferência (/admin/results), clique em Destravar, informe o motivo e tente de novo.';
  }
  if (mensagem.includes('wod2_results_run_km_check')) {
    return 'Distância de corrida inválida. A troca de atleta só acontece a cada 500 m, então a corrida só pode ser 0,5 · 1,0 · 1,5 · 2,0 km e assim por diante.';
  }
  if (mensagem.includes('wod3_completed_needs_time')) {
    return 'Quem concluiu precisa ter o tempo preenchido no formato MM:SS (ex.: 14:32).';
  }
  return mensagem;
}

function fail(error: unknown): ActionResult {
  return {
    ok: false,
    message: error instanceof Error
      ? traduzir(error.message)
      : 'Não foi possível concluir a operação.',
  };
}

function revalidateTudo() {
  for (const path of ['/', '/leaderboard', '/display', '/admin', '/admin/results']) {
    revalidatePath(path);
  }
}

/* =========================================================================
   DUPLAS (§18)
   ========================================================================= */

export async function salvarDupla(input: unknown): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const dados = teamSchema.parse(input);
    const { supabase, eventId } = await requireAdmin();

    const payload = {
      event_id: eventId,
      team_number: dados.teamNumber,
      team_name: dados.teamName,
      category: dados.category,
      athlete_1: dados.athlete1,
      athlete_2: dados.athlete2,
      battery: dados.battery,
      status: dados.status,
    };

    const { error } = dados.id
      ? await supabase.from('teams').update(payload).eq('id', dados.id)
      : await supabase.from('teams').insert(payload);

    if (error) {
      if (error.code === '23505') {
        return { ok: false, message: `Já existe uma dupla com o número ${dados.teamNumber}.` };
      }
      throw new Error(error.message);
    }

    revalidateTudo();
    revalidatePath('/admin/teams');
    return { ok: true, message: `Dupla ${dados.teamNumber} salva.` };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    return fail(error);
  }
}

export async function excluirDupla(teamId: string): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const { supabase } = await requireAdmin();
    const { error } = await supabase.from('teams').delete().eq('id', teamId);
    if (error) throw new Error(error.message);

    revalidateTudo();
    revalidatePath('/admin/teams');
    return { ok: true, message: 'Dupla excluída.' };
  } catch (error) {
    return fail(error);
  }
}

/* =========================================================================
   RESULTADOS (§19, §20, §21)
   ========================================================================= */

export async function salvarWod1(rows: unknown[]): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const { supabase, user, eventId } = await requireAdmin();
    const parsed = rows.map((r) => wod1RowSchema.parse(r));

    const payload = parsed.map((r) => ({
      event_id: eventId,
      team_id: r.teamId,
      strict_press_athlete_1: r.strictPressAthlete1,
      strict_press_athlete_2: r.strictPressAthlete2,
      back_squat_athlete_1: r.backSquatAthlete1,
      back_squat_athlete_2: r.backSquatAthlete2,
      deadlift_athlete_1: r.deadliftAthlete1,
      deadlift_athlete_2: r.deadliftAthlete2,
      updated_by: user.id,
    }));

    const { error } = await supabase
      .from('wod1_results')
      .upsert(payload, { onConflict: 'team_id' });
    if (error) throw new Error(error.message);

    revalidateTudo();
    return { ok: true, message: `${payload.length} resultado(s) do WOD 1 salvos como rascunho.` };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    return fail(error);
  }
}

export async function salvarWod2(rows: unknown[]): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const { supabase, user, eventId } = await requireAdmin();

    // Valida linha a linha para dizer EXATAMENTE qual dupla tem problema —
    // no meio do evento, "dados inválidos" sem contexto não ajuda ninguém.
    const fieldErrors: Record<string, string> = {};
    const parsed: { teamId: string; runKm: number | null; bikeKm: number | null }[] = [];

    for (const row of rows) {
      const result = wod2RowSchema.safeParse(row);
      if (!result.success) {
        const teamId = (row as { teamId?: string }).teamId ?? 'desconhecida';
        fieldErrors[teamId] = result.error.issues[0]?.message ?? 'Valor inválido';
      } else {
        parsed.push(result.data);
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      return {
        ok: false,
        message: 'Corrija os valores destacados antes de salvar.',
        fieldErrors,
      };
    }

    const payload = parsed.map((r) => ({
      event_id: eventId,
      team_id: r.teamId,
      run_km: r.runKm,
      bike_km: r.bikeKm,
      updated_by: user.id,
    }));

    const { error } = await supabase
      .from('wod2_results')
      .upsert(payload, { onConflict: 'team_id' });
    if (error) throw new Error(error.message);

    revalidateTudo();
    return { ok: true, message: `${payload.length} resultado(s) do WOD 2 salvos como rascunho.` };
  } catch (error) {
    return fail(error);
  }
}

export async function salvarWod3(rows: unknown[]): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const { supabase, user, eventId } = await requireAdmin();

    const fieldErrors: Record<string, string> = {};
    const payload: Record<string, unknown>[] = [];

    for (const row of rows) {
      const result = wod3RowSchema.safeParse(row);
      if (!result.success) {
        const teamId = (row as { teamId?: string }).teamId ?? 'desconhecida';
        fieldErrors[teamId] = result.error.issues[0]?.message ?? 'Valor inválido';
        continue;
      }
      payload.push({
        event_id: eventId,
        team_id: result.data.teamId,
        time_seconds: result.data.timeSeconds,
        completed: result.data.completed,
        volume_completed: result.data.volumeCompleted,
        updated_by: user.id,
      });
    }

    if (Object.keys(fieldErrors).length > 0) {
      return { ok: false, message: 'Corrija os tempos destacados.', fieldErrors };
    }

    const { error } = await supabase
      .from('wod3_results')
      .upsert(payload, { onConflict: 'team_id' });
    if (error) throw new Error(error.message);

    revalidateTudo();
    return { ok: true, message: `${payload.length} resultado(s) do WOD 3 salvos como rascunho.` };
  } catch (error) {
    return fail(error);
  }
}

/* =========================================================================
   HOMOLOGAÇÃO (§22) — DRAFT -> PUBLISHED -> LOCKED
   ========================================================================= */

const TABELA: Record<WodNumber, string> = {
  1: 'wod1_results',
  2: 'wod2_results',
  3: 'wod3_results',
};

export async function definirStatus(
  wod: WodNumber,
  teamIds: string[],
  status: ResultStatus,
): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const { supabase, user, eventId } = await requireAdmin();
    if (teamIds.length === 0) {
      return { ok: false, message: 'Nenhuma dupla selecionada.' };
    }

    const { error } = await supabase
      .from(TABELA[wod])
      .update({ status, updated_by: user.id })
      .in('team_id', teamIds);

    if (error) throw new Error(error.message);

    // O gatilho do banco já recalcula, mas pedimos explicitamente: assim o
    // recálculo acontece ainda dentro desta requisição e a próxima leitura
    // já sai correta (§25).
    const { error: recalcError } = await supabase.rpc('athx_recalculate_event', {
      p_event: eventId,
    });
    if (recalcError) throw new Error(recalcError.message);

    revalidateTudo();

    const rotulo =
      status === 'PUBLISHED' ? 'publicados' : status === 'LOCKED' ? 'travados' : 'em rascunho';
    return {
      ok: true,
      message: `Resultados do WOD ${wod} ${rotulo} com sucesso. (${teamIds.length} dupla(s))`,
    };
  } catch (error) {
    return fail(error);
  }
}

/** Destrava um resultado LOCKED — exige motivo e gera auditoria (§22, §23). */
export async function destravarResultado(
  wod: WodNumber,
  teamId: string,
  motivo: string,
): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const { supabase, eventId } = await requireAdmin();

    const { error } = await supabase.rpc('athx_unlock_result', {
      p_wod_number: wod,
      p_team_id: teamId,
      p_reason: motivo,
    });
    if (error) throw new Error(error.message);

    await supabase.rpc('athx_recalculate_event', { p_event: eventId });
    revalidateTudo();
    return { ok: true, message: 'Resultado destravado e registrado na auditoria.' };
  } catch (error) {
    return fail(error);
  }
}

export async function recalcular(): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const { supabase, eventId } = await requireAdmin();
    const { error } = await supabase.rpc('athx_recalculate_event', { p_event: eventId });
    if (error) throw new Error(error.message);

    revalidateTudo();
    return { ok: true, message: 'Classificação recalculada.' };
  } catch (error) {
    return fail(error);
  }
}

/* =========================================================================
   CONFIGURAÇÕES (§15, §41, §48)
   ========================================================================= */

export async function salvarConfiguracoes(input: unknown): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const dados = settingsSchema.parse(input);
    const { supabase, user, eventId } = await requireAdmin();

    const { error } = await supabase
      .from('event_settings')
      .update({
        tie_points_mode: dados.tiePointsMode,
        dnf_policy: dados.dnfPolicy,
        tie_breaker_1: dados.tieBreaker1 || null,
        tie_breaker_2: dados.tieBreaker2 || null,
        tie_breaker_3: dados.tieBreaker3 || null,
        live_mode: dados.liveMode,
        maintenance_mode: dados.maintenanceMode,
        updated_by: user.id,
      })
      .eq('event_id', eventId);

    if (error) throw new Error(error.message);

    // Mudar o modo de empate ou a política de DNF muda a classificação.
    await supabase.rpc('athx_recalculate_event', { p_event: eventId });
    revalidateTudo();
    revalidatePath('/admin/settings');

    return { ok: true, message: 'Configurações salvas e classificação recalculada.' };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    return fail(error);
  }
}

export async function sair(): Promise<void> {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
}
