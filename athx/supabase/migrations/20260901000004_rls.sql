-- ============================================================================
-- NAÇÃO ATHX · 0004 · Segurança (§35)
--
--   PÚBLICO  -> SELECT, e somente de resultado homologado (PUBLISHED/LOCKED)
--   ADMIN    -> INSERT / UPDATE / DELETE
--
-- A anon key pode circular no browser porque TODA autorização está aqui.
-- A service_role key NUNCA vai para o frontend.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Quem é admin: quem está em admin_users.
-- ---------------------------------------------------------------------------
create or replace function public.athx_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Views respeitam o RLS de quem consulta (e não do dono).
-- ---------------------------------------------------------------------------
alter view public.athx_standings    set (security_invoker = on);
alter view public.athx_public_wod1  set (security_invoker = on);
alter view public.athx_public_wod2  set (security_invoker = on);
alter view public.athx_public_wod3  set (security_invoker = on);
alter view public.athx_last_update  set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- RLS ligado em tudo.
-- ---------------------------------------------------------------------------
alter table public.events         enable row level security;
alter table public.event_settings enable row level security;
alter table public.teams          enable row level security;
alter table public.wod1_results   enable row level security;
alter table public.wod2_results   enable row level security;
alter table public.wod3_results   enable row level security;
alter table public.wod_results    enable row level security;
alter table public.audit_logs     enable row level security;
alter table public.admin_users    enable row level security;

-- ---------------------------------------------------------------------------
-- Leitura pública: evento, configurações e duplas.
-- ---------------------------------------------------------------------------
drop policy if exists events_public_read on public.events;
create policy events_public_read on public.events
  for select using (true);

drop policy if exists settings_public_read on public.event_settings;
create policy settings_public_read on public.event_settings
  for select using (true);

drop policy if exists teams_public_read on public.teams;
create policy teams_public_read on public.teams
  for select using (true);

-- ---------------------------------------------------------------------------
-- Leitura pública de resultado: SOMENTE homologado. Rascunho é do admin.
-- ---------------------------------------------------------------------------
drop policy if exists wod1_public_read on public.wod1_results;
create policy wod1_public_read on public.wod1_results
  for select using (status in ('PUBLISHED', 'LOCKED') or public.athx_is_admin());

drop policy if exists wod2_public_read on public.wod2_results;
create policy wod2_public_read on public.wod2_results
  for select using (status in ('PUBLISHED', 'LOCKED') or public.athx_is_admin());

drop policy if exists wod3_public_read on public.wod3_results;
create policy wod3_public_read on public.wod3_results
  for select using (status in ('PUBLISHED', 'LOCKED') or public.athx_is_admin());

drop policy if exists wod_results_public_read on public.wod_results;
create policy wod_results_public_read on public.wod_results
  for select using (status in ('PUBLISHED', 'LOCKED') or public.athx_is_admin());

-- ---------------------------------------------------------------------------
-- Escrita: somente admin.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'events', 'event_settings', 'teams',
    'wod1_results', 'wod2_results', 'wod3_results', 'wod_results'
  ] loop
    execute format('drop policy if exists %1$s_admin_write on public.%1$s;', t);
    execute format($f$
      create policy %1$s_admin_write on public.%1$s
        for all
        to authenticated
        using (public.athx_is_admin())
        with check (public.athx_is_admin());
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Auditoria: só admin lê; qualquer admin grava. Ninguém altera nem apaga.
-- ---------------------------------------------------------------------------
drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs
  for select to authenticated using (public.athx_is_admin());

drop policy if exists audit_admin_insert on public.audit_logs;
create policy audit_admin_insert on public.audit_logs
  for insert to authenticated with check (public.athx_is_admin());

-- ---------------------------------------------------------------------------
-- admin_users: cada admin enxerga a própria linha e a dos demais admins.
-- A inclusão de novos admins é feita pelo painel do Supabase (service role).
-- ---------------------------------------------------------------------------
drop policy if exists admin_users_read on public.admin_users;
create policy admin_users_read on public.admin_users
  for select to authenticated using (public.athx_is_admin() or user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- §22 — resultado LOCKED não muda por acidente.
-- Para alterar é preciso destravar explicitamente via athx_unlock_result(),
-- que registra auditoria. Nada de UPDATE silencioso.
-- ---------------------------------------------------------------------------
create or replace function public.athx_guard_locked()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'LOCKED'
     and coalesce(current_setting('athx.allow_locked_edit', true), 'off') <> 'on' then
    raise exception
      'Resultado LOCKED. Destrave com athx_unlock_result() antes de alterar.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['wod1_results', 'wod2_results', 'wod3_results'] loop
    execute format(
      'drop trigger if exists %1$s_guard_locked on public.%1$s;
       create trigger %1$s_guard_locked before update on public.%1$s
       for each row execute function public.athx_guard_locked();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Destrava um resultado LOCKED -> PUBLISHED, com auditoria obrigatória.
-- ---------------------------------------------------------------------------
create or replace function public.athx_unlock_result(
  p_wod_number smallint,
  p_team_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event uuid;
  v_email text;
begin
  if not public.athx_is_admin() then
    raise exception 'Apenas administradores podem destravar resultados.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'Informe o motivo do destravamento (mínimo 5 caracteres).'
      using errcode = 'check_violation';
  end if;

  select email into v_email from public.admin_users where user_id = auth.uid();

  perform set_config('athx.allow_locked_edit', 'on', true);

  if p_wod_number = 1 then
    update wod1_results set status = 'PUBLISHED', updated_by = auth.uid()
     where team_id = p_team_id returning event_id into v_event;
  elsif p_wod_number = 2 then
    update wod2_results set status = 'PUBLISHED', updated_by = auth.uid()
     where team_id = p_team_id returning event_id into v_event;
  elsif p_wod_number = 3 then
    update wod3_results set status = 'PUBLISHED', updated_by = auth.uid()
     where team_id = p_team_id returning event_id into v_event;
  else
    raise exception 'WOD inválido: %', p_wod_number;
  end if;

  perform set_config('athx.allow_locked_edit', 'off', true);

  insert into audit_logs (event_id, user_id, user_email, action, entity_type,
                          entity_id, team_id, wod_number, old_value, new_value)
  values (v_event, auth.uid(), v_email, 'UNLOCK',
          format('wod%s_results', p_wod_number), p_team_id, p_team_id, p_wod_number,
          jsonb_build_object('status', 'LOCKED'),
          jsonb_build_object('status', 'PUBLISHED', 'motivo', p_reason));
end;
$$;

revoke all on function public.athx_unlock_result(smallint, uuid, text) from public;
grant execute on function public.athx_unlock_result(smallint, uuid, text) to authenticated;
grant execute on function public.athx_recalculate_event(uuid) to authenticated;
