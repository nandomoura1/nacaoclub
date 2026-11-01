import 'server-only';

import { cookies } from 'next/headers';
import { getServerSupabase } from '@/lib/supabase/server';
import { IS_DEMO } from '@/lib/env';
import { DEMO_EVENT } from '@/lib/demo/fixtures';
import type { EventStatus } from '@/types/domain';

/**
 * QUAL EVENTO ESTAMOS VENDO.
 *
 * O site público e a organização olham coisas diferentes, e é por isso que
 * este arquivo existe:
 *
 *   PÚBLICO       vê o evento NO AR (status LIVE). É o leaderboard que o
 *                 atleta abre no celular durante a competição.
 *
 *   ORGANIZAÇÃO   vê o evento QUE ESTÁ EDITANDO, que pode ser outro. Montar
 *                 a etapa de março enquanto a de setembro ainda está no ar
 *                 é o caso normal, não a exceção.
 *
 * A escolha da organização mora num cookie em vez de na URL. Assim as telas
 * de admin continuam com endereços limpos (/admin/teams, /admin/wod/1) e
 * ninguém lança resultado no evento errado por ter copiado um link velho.
 */

export const COOKIE_EVENTO = 'athx_evento_em_edicao';

export interface EventoResumo {
  id: string;
  slug: string;
  name: string;
  date: string;
  status: EventStatus;
  /** true no evento que o público está vendo. */
  noAr: boolean;
  /** Quantas duplas e quantos WODs — o suficiente para a tela de histórico. */
  duplas: number;
  wods: number;
}

/**
 * Todos os eventos, do mais recente para o mais antigo.
 *
 * As contagens vêm por consulta separada porque o cliente do Supabase não
 * agrega; são poucas linhas e a tela é de administração, não de competição.
 */
export async function listarEventos(): Promise<EventoResumo[]> {
  if (IS_DEMO) {
    return [
      {
        id: DEMO_EVENT.id,
        slug: 'demonstracao',
        name: DEMO_EVENT.name,
        date: DEMO_EVENT.date,
        status: DEMO_EVENT.status,
        noAr: true,
        duplas: 20,
        wods: 3,
      },
    ];
  }

  const supabase = await getServerSupabase();

  const [eventosRes, atualRes] = await Promise.all([
    supabase.from('events').select('id, slug, name, date, status').order('date', {
      ascending: false,
    }),
    supabase.rpc('athx_evento_atual'),
  ]);

  const eventos = eventosRes.data ?? [];
  const idAtual = (atualRes.data as string | null) ?? null;

  const [duplasRes, wodsRes] = await Promise.all([
    supabase.from('teams').select('event_id'),
    supabase.from('wods').select('event_id'),
  ]);

  const contar = (linhas: { event_id: string }[] | null, id: string) =>
    (linhas ?? []).filter((l) => l.event_id === id).length;

  return eventos.map((e) => ({
    id: e.id as string,
    slug: e.slug as string,
    name: e.name as string,
    date: e.date as string,
    status: e.status as EventStatus,
    noAr: e.id === idAtual,
    duplas: contar(duplasRes.data as { event_id: string }[] | null, e.id as string),
    wods: contar(wodsRes.data as { event_id: string }[] | null, e.id as string),
  }));
}

/**
 * O slug que a organização escolheu editar, se ainda existir.
 *
 * Valida contra o banco de propósito: um evento apagado deixaria o cookie
 * apontando para o nada, e todas as telas de admin quebrariam com uma
 * mensagem de "evento não encontrado" sem dizer como sair daquilo.
 */
export async function slugEmEdicao(): Promise<string | null> {
  if (IS_DEMO) return null;

  const jar = await cookies();
  const slug = jar.get(COOKIE_EVENTO)?.value;
  if (!slug) return null;

  const supabase = await getServerSupabase();
  const { data } = await supabase.from('events').select('slug').eq('slug', slug).maybeSingle();

  return data ? slug : null;
}
