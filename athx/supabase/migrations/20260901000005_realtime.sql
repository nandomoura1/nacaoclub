-- ============================================================================
-- NAÇÃO ATHX · 0005 · Realtime (§27)
--
-- O admin lança um resultado; o celular de quem está na arquibancada atualiza
-- sozinho. Sem refresh manual.
--
-- O Realtime do Supabase aplica RLS por assinante: quem está com a anon key
-- só recebe linha PUBLISHED/LOCKED. Rascunho não vaza pelo websocket.
-- ============================================================================

-- A publicação já existe em qualquer projeto Supabase; criada aqui para que a
-- migration também rode em um Postgres limpo (CI, ambiente local).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'teams', 'wod1_results', 'wod2_results', 'wod3_results',
    'wod_results', 'event_settings', 'events'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;

-- Payload completo no UPDATE (o cliente precisa da linha inteira para
-- recalcular a tela sem ir ao banco de novo).
alter table public.teams          replica identity full;
alter table public.wod1_results   replica identity full;
alter table public.wod2_results   replica identity full;
alter table public.wod3_results   replica identity full;
alter table public.wod_results    replica identity full;
alter table public.event_settings replica identity full;

-- ---------------------------------------------------------------------------
-- Permissões de base. O RLS acima é quem realmente autoriza.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on
  public.events, public.event_settings, public.teams,
  public.wod1_results, public.wod2_results, public.wod3_results, public.wod_results,
  public.athx_standings, public.athx_public_wod1, public.athx_public_wod2,
  public.athx_public_wod3, public.athx_last_update
to anon, authenticated;

grant insert, update, delete on
  public.events, public.event_settings, public.teams,
  public.wod1_results, public.wod2_results, public.wod3_results, public.wod_results
to authenticated;

grant select, insert on public.audit_logs to authenticated;
grant select on public.admin_users to authenticated;
