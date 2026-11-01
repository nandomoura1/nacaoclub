-- ============================================================================
-- NAÇÃO ATHX · FALTA RODAR
--
-- As migrations 0012 e 0013 já estão no banco e conferidas. Este arquivo tem
-- só o que falta:
--
--   0014  segurança (RLS) das cinco tabelas novas  <- IMPORTANTE, rode logo
--   0015  agenda como dado (horários e baterias editáveis na tela)
--
-- COMO RODAR
--   1. Supabase -> projeto nacao-athx -> SQL Editor -> New query
--   2. Cole ESTE arquivo inteiro
--   3. Run  ->  deve aparecer "Success. No rows returned"
--
-- Seguro rodar mais de uma vez. Nenhum DROP de tabela, nenhum dado apagado.
-- ============================================================================


-- ========================================================================
-- 20260901000014_rls_do_modelo_generico.sql
-- ========================================================================

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


-- ========================================================================
-- 20260901000015_agenda_como_dado.sql
-- ========================================================================

-- ============================================================================
-- NAÇÃO ATHX · 0015 · A agenda e as baterias também viram dado
--
-- A programação do dia estava cravada em código (src/lib/wods.ts), com os
-- horários dos três workouts, duas baterias e os blocos de briefing e pódio.
-- Mudar o horário de uma bateria exigia deploy.
--
-- Agora a agenda é uma tabela, editável na tela de WODs:
--
--   · uma linha por momento do dia, na ordem em que acontece
--   · a linha de um workout aponta para o WOD e a bateria
--   · as outras (briefing, conferência, pódio) não apontam para nada
--
-- E o número de baterias sai de event_settings, em vez de ser sempre duas.
-- ============================================================================

alter table public.event_settings
  add column if not exists baterias integer not null default 2
    check (baterias between 1 and 20);

comment on column public.event_settings.baterias is
  'Quantas baterias o evento tem. A tela de duplas oferece de 1 até este número.';

create table if not exists public.agenda (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  ordem      integer not null default 1,
  hora       text not null,
  titulo     text not null,
  detalhe    text,
  -- Sub-itens, como o conteúdo do briefing.
  itens      text[] not null default '{}',
  -- Observação da organização, como o intervalo entre baterias.
  nota       text,
  -- Preenchidos quando a linha é a disputa de um workout.
  wod_id     uuid references public.wods(id) on delete cascade,
  bateria    integer check (bateria is null or bateria > 0),
  -- Dá peso visual na programação (o pódio, por exemplo).
  destaque   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agenda_event_idx on public.agenda (event_id, ordem);

drop trigger if exists agenda_touch on public.agenda;
create trigger agenda_touch before update on public.agenda
for each row execute function public.athx_touch_updated_at();

alter table public.agenda enable row level security;

grant select on public.agenda to anon, authenticated;
grant insert, update, delete on public.agenda to authenticated;

drop policy if exists agenda_public_read on public.agenda;
create policy agenda_public_read on public.agenda for select using (true);

drop policy if exists agenda_admin_write on public.agenda;
create policy agenda_admin_write on public.agenda
  for all using (public.athx_is_admin()) with check (public.athx_is_admin());

-- ---------------------------------------------------------------------------
-- A programação da etapa de setembro, como estava no código.
-- ---------------------------------------------------------------------------
create or replace function public.athx_montar_agenda_setembro(v_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v1 uuid;
  v2 uuid;
  v3 uuid;
begin
  if exists (select 1 from public.agenda where event_id = v_event) then
    raise notice 'NAÇÃO ATHX · evento % já tem agenda, nada a fazer', v_event;
    return;
  end if;

  select id into v1 from public.wods where event_id = v_event and numero = 1;
  select id into v2 from public.wods where event_id = v_event and numero = 2;
  select id into v3 from public.wods where event_id = v_event and numero = 3;

  insert into public.agenda (event_id, ordem, hora, titulo, detalhe, itens, nota, wod_id, bateria, destaque) values
    (v_event, 1, '08h00', 'Aquecimento + Briefing', 'Presença obrigatória de todos os participantes',
     array['Aquecimento geral','Mobilidade e preparação','Apresentação dos workouts','Explicação das regras',
           'Orientações sobre execução dos movimentos','Estratégias e divisão das tarefas','Esclarecimento de dúvidas'],
     null, null, null, false),
    (v_event, 2, '09h00–09h16', 'Workout 01 — Bateria 1', 'Strength', '{}', null, v1, 1, false),
    (v_event, 3, '09h26–09h42', 'Workout 01 — Bateria 2', 'Strength', '{}', 'Intervalo de 14'' entre as baterias', v1, 2, false),
    (v_event, 4, '09h30–09h52', 'Workout 02 — Bateria 1', 'Endurance', '{}', null, v2, 1, false),
    (v_event, 5, '09h56–10h16', 'Workout 02 — Bateria 2', 'Endurance', '{}', 'Intervalo de 20'' entre as baterias', v2, 2, false),
    (v_event, 6, '10h12–10h32', 'Workout 03 — Bateria 1', 'Metcon', '{}', null, v3, 1, false),
    (v_event, 7, '10h36–10h56', 'Workout 03 — Bateria 2', 'Metcon', '{}', null, v3, 2, false),
    (v_event, 8, '11h00', 'Conferência / classificação', null, '{}', null, null, null, false),
    (v_event, 9, '11h30', 'Pódio', null, '{}', null, null, null, true);

  raise notice 'NAÇÃO ATHX · agenda do evento % montada', v_event;
end;
$$;

do $$
declare v_event uuid;
begin
  for v_event in select id from public.events loop
    perform public.athx_montar_agenda_setembro(v_event);
  end loop;
end;
$$;

