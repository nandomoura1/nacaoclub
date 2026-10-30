'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { EVENT_SLUG, IS_DEMO } from '@/lib/env';
import { getServerSupabase } from '@/lib/supabase/server';
import {
  agendaSchema,
  lancamentoSchema,
  provaSchema,
  settingsSchema,
  teamSchema,
  wodSchema,
} from '@/lib/validation';
import { parseTimeToSeconds } from '@/lib/time';
import type { ResultStatus } from '@/types/domain';

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




/* =========================================================================
   HOMOLOGAÇÃO (§22) — DRAFT -> PUBLISHED -> LOCKED
   ========================================================================= */


export async function definirStatus(
  wodId: string,
  teamIds: string[],
  status: ResultStatus,
): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const { supabase, user } = await requireAdmin();
    if (teamIds.length === 0) {
      return { ok: false, message: 'Nenhuma dupla selecionada.' };
    }

    const { error } = await supabase
      .from('wod_entries')
      .update({ status, updated_by: user.id })
      .eq('wod_id', wodId)
      .in('team_id', teamIds);

    if (error) throw new Error(error.message);

    // Não há recálculo a pedir: a pontuação é calculada na leitura, pela
    // view athx_prova_scores e pelo motor TypeScript. Publicar já basta.
    revalidateTudo();

    const rotulo =
      status === 'PUBLISHED' ? 'publicados' : status === 'LOCKED' ? 'travados' : 'em rascunho';
    return {
      ok: true,
      message: `Resultados ${rotulo} com sucesso. (${teamIds.length} dupla(s))`,
    };
  } catch (error) {
    return fail(error);
  }
}

/** Destrava um resultado LOCKED — exige motivo e gera auditoria (§22, §23). */
export async function destravarResultado(
  wodId: string,
  teamId: string,
  motivo: string,
): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const { supabase } = await requireAdmin();

    const { error } = await supabase.rpc('athx_unlock_entry', {
      p_wod: wodId,
      p_team: teamId,
      p_motivo: motivo,
    });
    if (error) throw new Error(error.message);

    revalidateTudo();
    return { ok: true, message: 'Resultado destravado e registrado na auditoria.' };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Releitura forçada.
 *
 * Não existe mais "recalcular": a pontuação é calculada na leitura, tanto
 * pelo motor TypeScript quanto pelas views do banco. Nada fica materializado
 * para sair do lugar. O botão continua existindo porque é útil quando a
 * pessoa quer ter certeza de que está vendo o estado mais recente.
 */
export async function recalcular(): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    await requireAdmin();
    revalidateTudo();
    return { ok: true, message: 'Classificação atualizada a partir dos lançamentos.' };
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
        // Grava o CÓDIGO do critério, não a frase. É ele que o motor lê.
        tie_breaker_1: dados.tieBreaker1,
        tie_breaker_2: dados.tieBreaker2,
        tie_breaker_3: dados.tieBreaker3,
        live_mode: dados.liveMode,
        maintenance_mode: dados.maintenanceMode,
        updated_by: user.id,
      })
      .eq('event_id', eventId);

    if (error) throw new Error(error.message);

    // Mudar o modo do WOD 1, o de empate ou a política de DNF muda a
    // classificação inteira.
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


/* ==========================================================================
   LANÇAMENTO DE RESULTADOS
   ========================================================================== */

/**
 * Converte o que o juiz digitou conforme a UNIDADE da prova.
 *
 * O campo é texto porque é um input. Tempo chega "14:32", distância chega
 * "2,41", carga chega "137,5". A conversão acontece aqui, no servidor, que é
 * onde a unidade da prova é conhecida — a tela só mostra o teclado certo.
 */
function paraNumero(texto: string | null, unidade: string): number | null {
  const limpo = (texto ?? '').trim();
  if (limpo === '') return null;

  if (unidade === 'SEGUNDOS') return parseTimeToSeconds(limpo);

  const n = Number(limpo.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Salva o lançamento de um WOD inteiro: a homologação de cada dupla e o
 * valor dela em cada prova digitada.
 *
 * Uma ação só para qualquer workout. Antes eram três, uma por WOD, cada uma
 * sabendo os nomes das colunas daquele — e um WOD novo pedia uma quarta.
 */
export async function salvarLancamentos(
  wodId: string,
  linhas: unknown[],
): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const dados = linhas.map((l) => lancamentoSchema.parse(l));
    const { supabase, user, eventId } = await requireAdmin();

    const { data: provas, error: provasError } = await supabase
      .from('provas')
      .select('id, unidade, por_atleta, origem')
      .eq('wod_id', wodId);
    if (provasError) throw new Error(provasError.message);

    const porId = new Map((provas ?? []).map((p) => [p.id as string, p]));

    // Homologação: uma linha por dupla.
    const entradas = dados.map((l) => ({
      event_id: eventId,
      wod_id: wodId,
      team_id: l.teamId,
      concluiu: l.concluiu,
      volume: l.volume,
      updated_by: user.id,
    }));

    const { error: entradaError } = await supabase
      .from('wod_entries')
      .upsert(entradas, { onConflict: 'wod_id,team_id' });
    if (entradaError) throw new Error(entradaError.message);

    // Valores: um por prova digitada. Prova calculada nunca é gravada.
    const valores: Record<string, unknown>[] = [];
    for (const linha of dados) {
      for (const [provaId, campos] of Object.entries(linha.valores)) {
        const prova = porId.get(provaId);
        if (!prova || prova.origem !== 'DIGITADA') continue;

        valores.push({
          event_id: eventId,
          prova_id: provaId,
          team_id: linha.teamId,
          valor: prova.por_atleta ? null : paraNumero(campos.valor, prova.unidade),
          valor_atleta_1: prova.por_atleta ? paraNumero(campos.atleta1, prova.unidade) : null,
          valor_atleta_2: prova.por_atleta ? paraNumero(campos.atleta2, prova.unidade) : null,
        });
      }
    }

    if (valores.length > 0) {
      const { error } = await supabase
        .from('prova_results')
        .upsert(valores, { onConflict: 'prova_id,team_id' });
      if (error) throw new Error(error.message);
    }

    revalidateTudo();
    return { ok: true, message: `${dados.length} lançamento(s) salvos.` };
  } catch (error) {
    return fail(error);
  }
}

/* ==========================================================================
   O EVENTO: WODs, PROVAS E AGENDA
   ========================================================================== */

export async function salvarWod(input: unknown): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const dados = wodSchema.parse(input);
    const { supabase, eventId } = await requireAdmin();

    const linha = {
      event_id: eventId,
      numero: dados.numero,
      nome: dados.nome,
      formato: dados.formato,
      cap_segundos: dados.capSegundos,
      resumo: dados.resumo,
      permite_cap: dados.permiteCap,
      regras: dados.regras,
      pendencias: dados.pendencias,
      ordem: dados.ordem,
    };

    const { data, error } = dados.id
      ? await supabase.from('wods').update(linha).eq('id', dados.id).select('id').single()
      : await supabase.from('wods').insert(linha).select('id').single();
    if (error) throw new Error(error.message);

    const wodId = data.id as string;

    // Os blocos são reescritos por inteiro: é uma lista ordenada curta, e
    // casar item a item renderia mais código do que valor.
    const { error: limpa } = await supabase.from('wod_blocos').delete().eq('wod_id', wodId);
    if (limpa) throw new Error(limpa.message);

    if (dados.blocos.length > 0) {
      const { error: insere } = await supabase.from('wod_blocos').insert(
        dados.blocos.map((b) => ({
          wod_id: wodId,
          ordem: b.ordem,
          janela: b.janela,
          movimento: b.movimento,
          detalhe: b.detalhe,
          masculino: b.masculino,
          feminino: b.feminino,
        })),
      );
      if (insere) throw new Error(insere.message);
    }

    revalidateTudo();
    return { ok: true, message: `WOD ${dados.numero} salvo.` };
  } catch (error) {
    return fail(error);
  }
}

export async function excluirWod(wodId: string): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const { supabase } = await requireAdmin();

    // Apagar um WOD apaga as provas e os lançamentos dele em cascata. Avisar
    // o tamanho do estrago é obrigação de quem pergunta "tem certeza?".
    const { count } = await supabase
      .from('prova_results')
      .select('id', { count: 'exact', head: true })
      .in(
        'prova_id',
        ((await supabase.from('provas').select('id').eq('wod_id', wodId)).data ?? []).map(
          (p) => p.id as string,
        ),
      );

    const { error } = await supabase.from('wods').delete().eq('id', wodId);
    if (error) throw new Error(error.message);

    revalidateTudo();
    return {
      ok: true,
      message:
        count && count > 0
          ? `WOD excluído, junto com ${count} lançamento(s).`
          : 'WOD excluído.',
    };
  } catch (error) {
    return fail(error);
  }
}

export async function salvarProva(input: unknown): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const dados = provaSchema.parse(input);
    const { supabase } = await requireAdmin();

    const linha = {
      wod_id: dados.wodId,
      codigo: dados.codigo.toUpperCase(),
      descricao: dados.descricao,
      criterio: dados.criterio,
      unidade: dados.unidade,
      direcao: dados.direcao,
      origem: dados.origem,
      por_atleta: dados.porAtleta,
      componentes: dados.componentes.map((c) => c.toUpperCase()),
      pontua: dados.pontua,
      ordem: dados.ordem,
    };

    const { error } = dados.id
      ? await supabase.from('provas').update(linha).eq('id', dados.id)
      : await supabase.from('provas').insert(linha);
    if (error) throw new Error(error.message);

    revalidateTudo();
    return { ok: true, message: `Prova ${linha.codigo} salva.` };
  } catch (error) {
    return fail(error);
  }
}

export async function excluirProva(provaId: string): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const { supabase } = await requireAdmin();

    const { count } = await supabase
      .from('prova_results')
      .select('id', { count: 'exact', head: true })
      .eq('prova_id', provaId);

    const { error } = await supabase.from('provas').delete().eq('id', provaId);
    if (error) throw new Error(error.message);

    revalidateTudo();
    return {
      ok: true,
      message:
        count && count > 0 ? `Prova excluída, junto com ${count} lançamento(s).` : 'Prova excluída.',
    };
  } catch (error) {
    return fail(error);
  }
}

export async function salvarAgenda(itens: unknown[]): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_BLOCK;

  try {
    const dados = itens.map((i) => agendaSchema.parse(i));
    const { supabase, eventId } = await requireAdmin();

    // A agenda é uma lista ordenada curta: reescrever por inteiro é mais
    // simples e mais previsível do que casar linha a linha.
    const { error: limpa } = await supabase.from('agenda').delete().eq('event_id', eventId);
    if (limpa) throw new Error(limpa.message);

    if (dados.length > 0) {
      const { error } = await supabase.from('agenda').insert(
        dados.map((a) => ({
          event_id: eventId,
          ordem: a.ordem,
          hora: a.hora,
          titulo: a.titulo,
          detalhe: a.detalhe,
          itens: a.itens,
          nota: a.nota,
          wod_id: a.wodId,
          bateria: a.bateria,
          destaque: a.destaque,
        })),
      );
      if (error) throw new Error(error.message);
    }

    revalidateTudo();
    return { ok: true, message: `Programação salva (${dados.length} momentos).` };
  } catch (error) {
    return fail(error);
  }
}
