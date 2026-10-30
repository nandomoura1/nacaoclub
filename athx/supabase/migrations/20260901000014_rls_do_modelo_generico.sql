-- ============================================================================
-- NAÇÃO ATHX · 0014 · Segurança das tabelas novas (§35)
--
--   PÚBLICO  -> SELECT: a definição do evento é pública (todo mundo pode ler
--               a prescrição dos WODs), e os LANÇAMENTOS só quando
--               homologados (PUBLISHED/LOCKED)
--   ADMIN    -> INSERT / UPDATE / DELETE
--
-- Tabela nova com RLS desligado é tabela aberta. Este arquivo existe para
-- que isso não aconteça por esquecimento.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Privilégios de tabela.
--
-- O RLS decide QUAIS LINHAS cada um vê; o GRANT decide se ele pode olhar a
-- tabela. Os dois são necessários — RLS sem grant recusa tudo, grant sem RLS
-- libera tudo. Explícito aqui em vez de depender do padrão da plataforma.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['wods', 'wod_blocos', 'provas', 'wod_entries', 'prova_results'] loop
    execute format('grant select on public.%I to anon, authenticated;', t);
    execute format('grant insert, update, delete on public.%I to authenticated;', t);
  end loop;
end;
$$;

grant select on public.athx_valores, public.athx_prova_scores,
                public.athx_wod_scores, public.athx_standings
  to anon, authenticated;

alter table public.wods          enable row level security;
alter table public.wod_blocos    enable row level security;
alter table public.provas        enable row level security;
alter table public.wod_entries   enable row level security;
alter table public.prova_results enable row level security;

-- ---------------------------------------------------------------------------
-- A DEFINIÇÃO do evento é pública.
--
-- A prescrição dos workouts, as provas e os critérios são justamente o que o
-- atleta precisa ler antes de competir — a página /wod/1 existe para isso.
-- Esconder seria esconder o regulamento.
-- ---------------------------------------------------------------------------
drop policy if exists wods_public_read on public.wods;
create policy wods_public_read on public.wods for select using (true);

drop policy if exists blocos_public_read on public.wod_blocos;
create policy blocos_public_read on public.wod_blocos for select using (true);

drop policy if exists provas_public_read on public.provas;
create policy provas_public_read on public.provas for select using (true);

-- ---------------------------------------------------------------------------
-- Os LANÇAMENTOS, não. O público lê só o que foi homologado (§19).
--
-- Um rascunho é trabalho em andamento: o juiz ainda vai conferir com a
-- dupla. Vazar rascunho é anunciar resultado que pode mudar.
-- ---------------------------------------------------------------------------
drop policy if exists entries_public_read on public.wod_entries;
create policy entries_public_read on public.wod_entries
  for select using (status in ('PUBLISHED', 'LOCKED') or public.athx_is_admin());

drop policy if exists prova_results_public_read on public.prova_results;
create policy prova_results_public_read on public.prova_results
  for select using (
    public.athx_is_admin()
    or exists (
      select 1
      from public.provas p
      join public.wod_entries e on e.wod_id = p.wod_id and e.team_id = prova_results.team_id
      where p.id = prova_results.prova_id
        and e.status in ('PUBLISHED', 'LOCKED')
    )
  );

-- ---------------------------------------------------------------------------
-- Escrita: só admin, em tudo.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['wods', 'wod_blocos', 'provas', 'wod_entries', 'prova_results'] loop
    execute format('drop policy if exists %1$s_admin_write on public.%1$s;', t);
    execute format(
      'create policy %1$s_admin_write on public.%1$s
         for all using (public.athx_is_admin()) with check (public.athx_is_admin());', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resultado TRAVADO não muda por acidente (§20).
--
-- A trava protege o que foi LANÇADO. Como a pontuação agora é calculada na
-- leitura por uma view, não existe mais coluna derivada para o guarda
-- confundir com edição humana — o bug que travou a homologação em setembro
-- não tem como voltar.
-- ---------------------------------------------------------------------------
create or replace function public.athx_guard_entry_locked()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'LOCKED' then
    return new;
  end if;

  if coalesce(current_setting('athx.allow_locked_edit', true), 'off') = 'on' then
    return new;
  end if;

  raise exception 'Resultado LOCKED. Destrave com athx_unlock_entry() antes de alterar.'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists wod_entries_locked on public.wod_entries;
create trigger wod_entries_locked before update or delete on public.wod_entries
for each row execute function public.athx_guard_entry_locked();

create or replace function public.athx_guard_result_locked()
returns trigger
language plpgsql
as $$
declare
  v_status athx_result_status;
  v_team   uuid := case when tg_op = 'DELETE' then old.team_id else new.team_id end;
  v_prova  uuid := case when tg_op = 'DELETE' then old.prova_id else new.prova_id end;
begin
  if coalesce(current_setting('athx.allow_locked_edit', true), 'off') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select e.status into v_status
  from public.wod_entries e
  join public.provas p on p.wod_id = e.wod_id
  where p.id = v_prova and e.team_id = v_team;

  if v_status = 'LOCKED' then
    raise exception 'Resultado LOCKED. Destrave com athx_unlock_entry() antes de alterar.'
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists prova_results_locked on public.prova_results;
create trigger prova_results_locked before update or delete on public.prova_results
for each row execute function public.athx_guard_result_locked();

-- ---------------------------------------------------------------------------
-- Destravar é explícito, exige motivo e fica na auditoria.
-- ---------------------------------------------------------------------------
create or replace function public.athx_unlock_entry(p_wod uuid, p_team uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_event uuid;
begin
  if not public.athx_is_admin() then
    raise exception 'Apenas a organização pode destravar um resultado.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(length(btrim(p_motivo)), 0) < 5 then
    raise exception 'Informe o motivo do destravamento (mínimo de 5 caracteres).'
      using errcode = 'check_violation';
  end if;

  select email into v_email from admin_users where user_id = auth.uid();
  select event_id into v_event from wod_entries where wod_id = p_wod and team_id = p_team;

  perform set_config('athx.allow_locked_edit', 'on', true);
  update wod_entries set status = 'PUBLISHED', updated_by = auth.uid()
  where wod_id = p_wod and team_id = p_team;
  perform set_config('athx.allow_locked_edit', 'off', true);

  insert into audit_logs (event_id, user_id, user_email, action, entity_type, entity_id, team_id, old_value, new_value)
  values (v_event, auth.uid(), v_email, 'UNLOCK', 'wod_entries', p_wod, p_team,
          jsonb_build_object('status', 'LOCKED'),
          jsonb_build_object('status', 'PUBLISHED', 'motivo', p_motivo));
end;
$$;

grant execute on function public.athx_unlock_entry(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Auditoria dos lançamentos novos.
--
-- Só o que é DIGITADO POR GENTE entra no histórico. Como não há mais coluna
-- derivada nestas tabelas, não há recálculo para inundar a auditoria.
-- ---------------------------------------------------------------------------
create or replace function public.athx_audit_prova()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_event uuid := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  v_team  uuid := case when tg_op = 'DELETE' then old.team_id else new.team_id end;
begin
  select email into v_email from admin_users where user_id = auth.uid();

  insert into audit_logs (
    event_id, user_id, user_email, action, entity_type, entity_id, team_id, old_value, new_value
  ) values (
    v_event, auth.uid(), v_email, tg_op, tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    v_team,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['wod_entries', 'prova_results'] loop
    execute format(
      'drop trigger if exists %1$s_audit on public.%1$s;
       create trigger %1$s_audit after insert or update or delete on public.%1$s
       for each row execute function public.athx_audit_prova();', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime: a tela se atualiza sozinha quando o juiz lança (§34).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['wods', 'provas', 'wod_entries', 'prova_results'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
exception
  when undefined_object then
    raise notice 'NAÇÃO ATHX · publicação supabase_realtime não existe neste banco (ok fora do Supabase)';
end;
$$;
