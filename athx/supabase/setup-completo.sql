-- ============================================================================
--
--   NAÇÃO ATHX — INSTALAÇÃO COMPLETA DO BANCO
--   Nação Celebration · Etapa Setembro Amarelo · 12 de setembro
--
-- ----------------------------------------------------------------------------
--
--   COMO USAR (leva 1 minuto):
--
--   1. abra o painel do seu projeto no Supabase
--   2. menu da esquerda -> SQL Editor
--   3. clique em "New query"
--   4. cole TODO o conteúdo deste arquivo
--   5. clique em RUN (ou Ctrl+Enter)
--
--   Pronto. Cria as tabelas, o motor de classificação, a segurança, o
--   tempo real, a auditoria, o evento e as 20 duplas.
--
--   Pode rodar mais de uma vez sem medo: é idempotente, não duplica nada
--   e não apaga resultado já lançado.
--
--   DEPOIS DISSO falta só liberar o seu acesso de administrador —
--   use o arquivo supabase/tornar-admin.sql.
--
-- ----------------------------------------------------------------------------
--
--   ESTE ARQUIVO É GERADO. Não edite aqui.
--   Ele é a junção, na ordem, de:
--
--     supabase/migrations/20260901000001_schema.sql
--     supabase/migrations/20260901000002_scoring.sql
--     supabase/migrations/20260901000003_views.sql
--     supabase/migrations/20260901000004_rls.sql
--     supabase/migrations/20260901000005_realtime.sql
--     supabase/migrations/20260901000006_audit.sql
--     supabase/migrations/20260901000007_wod1_provas.sql
--     supabase/migrations/20260901000009_distancia_livre.sql
--     supabase/seed.sql
--
--   Para regenerar:  node scripts/gerar-setup.mjs
--
-- ============================================================================


-- ============================================================================
-- >>> 20260901000001_schema.sql
-- ============================================================================

-- ============================================================================
-- NAÇÃO ATHX — LIVE LEADERBOARD
-- 0001 · Estrutura base
--
-- Evento: Nação Celebration — Etapa Setembro Amarelo · 12/09 · Nação Club
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
do $$ begin
  create type athx_category as enum ('MASCULINA', 'FEMININA', 'MISTA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type athx_team_status as enum ('INSCRITA', 'ATIVA', 'DESCLASSIFICADA');
exception when duplicate_object then null; end $$;

-- §22 — homologação: DRAFT -> PUBLISHED -> LOCKED
do $$ begin
  create type athx_result_status as enum ('DRAFT', 'PUBLISHED', 'LOCKED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type athx_event_status as enum ('DRAFT', 'LIVE', 'FINISHED');
exception when duplicate_object then null; end $$;

-- §26 — como pontuar empates numéricos exatos
do $$ begin
  create type athx_tie_points_mode as enum ('COMPETITION', 'AVERAGE');
exception when duplicate_object then null; end $$;

-- §13/§48 — como ordenar quem não concluiu o WOD 3 (nada é assumido)
do $$ begin
  create type athx_dnf_policy as enum ('PENDING_DEFINITION', 'VOLUME_DESC', 'TIED_LAST');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  date        date not null,
  status      athx_event_status not null default 'DRAFT',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- event_settings — TUDO que a organização ainda não fechou mora aqui (§48)
-- ---------------------------------------------------------------------------
create table if not exists public.event_settings (
  event_id          uuid primary key references public.events(id) on delete cascade,
  tie_points_mode   athx_tie_points_mode not null default 'COMPETITION',
  dnf_policy        athx_dnf_policy not null default 'PENDING_DEFINITION',
  -- §15 — critérios de desempate: vazios até a organização definir
  tie_breaker_1     text,
  tie_breaker_2     text,
  tie_breaker_3     text,
  -- §41 — modos de operação
  live_mode         boolean not null default true,
  maintenance_mode  boolean not null default false,
  updated_at        timestamptz not null default now(),
  updated_by        uuid
);

-- ---------------------------------------------------------------------------
-- admin_users — quem pode escrever. Base do RLS.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id     uuid primary key,
  email       text not null,
  name        text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- teams — §18
-- ---------------------------------------------------------------------------
create table if not exists public.teams (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  team_number  integer not null check (team_number > 0),
  team_name    text not null,
  category     athx_category not null,
  athlete_1    text not null default '',
  athlete_2    text not null default '',
  battery      smallint not null default 1 check (battery in (1, 2)),
  status       athx_team_status not null default 'INSCRITA',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (event_id, team_number)
);

create index if not exists teams_event_battery_idx on public.teams (event_id, battery);
create index if not exists teams_event_category_idx on public.teams (event_id, category);
create index if not exists teams_event_number_idx on public.teams (event_id, team_number);

-- ---------------------------------------------------------------------------
-- wod1_results — STRENGTH · CAP 15'
--   1A 1RM Strict Press · 1B 3RM Back Squat · 1C 5RM Deadlift
--   1D Total de cargas = soma dos seis levantamentos (maior = melhor)
-- ---------------------------------------------------------------------------
create table if not exists public.wod1_results (
  id                        uuid primary key default gen_random_uuid(),
  event_id                  uuid not null references public.events(id) on delete cascade,
  team_id                   uuid not null unique references public.teams(id) on delete cascade,
  strict_press_athlete_1    numeric(6,2) check (strict_press_athlete_1 >= 0),
  strict_press_athlete_2    numeric(6,2) check (strict_press_athlete_2 >= 0),
  back_squat_athlete_1      numeric(6,2) check (back_squat_athlete_1 >= 0),
  back_squat_athlete_2      numeric(6,2) check (back_squat_athlete_2 >= 0),
  deadlift_athlete_1        numeric(6,2) check (deadlift_athlete_1 >= 0),
  deadlift_athlete_2        numeric(6,2) check (deadlift_athlete_2 >= 0),
  -- Prova 1D: calculada pelo banco, nunca digitada.
  total_load numeric(8,2) generated always as (
    coalesce(strict_press_athlete_1, 0) + coalesce(strict_press_athlete_2, 0) +
    coalesce(back_squat_athlete_1, 0)   + coalesce(back_squat_athlete_2, 0) +
    coalesce(deadlift_athlete_1, 0)     + coalesce(deadlift_athlete_2, 0)
  ) stored,
  rank        integer,
  points      numeric(6,2),
  tied        boolean not null default false,
  status      athx_result_status not null default 'DRAFT',
  -- §11 — rastreabilidade do lançamento
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists wod1_event_status_idx on public.wod1_results (event_id, status);

-- ---------------------------------------------------------------------------
-- wod2_results — ENDURANCE · AMRAP 22'
--   2A maior KM corrida · 2B maior KM bike · 2C maior soma
--   Pontuação do WOD 2 = Pts 2A + Pts 2B + Pts 2C
-- ---------------------------------------------------------------------------
create table if not exists public.wod2_results (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  team_id      uuid not null unique references public.teams(id) on delete cascade,

  -- REGRA CRÍTICA (§12): a troca do atleta da corrida só acontece a cada
  -- 500 m. Logo, a distância de corrida é sempre múltipla de 500 m.
  -- 300 m, 700 m ou 1200 m são rejeitados pelo próprio banco.
  run_km       numeric(6,3) check (
                 run_km is null
                 or (run_km >= 0 and (round(run_km * 1000)::bigint % 500) = 0)
               ),
  bike_km      numeric(6,3) check (bike_km is null or bike_km >= 0),

  total_km numeric(8,3) generated always as (
    coalesce(run_km, 0) + coalesce(bike_km, 0)
  ) stored,

  rank_run      integer,
  points_run    numeric(6,2),
  rank_bike     integer,
  points_bike   numeric(6,2),
  rank_total    integer,
  points_total  numeric(6,2),
  -- Soma das três provas — é o que entra na classificação geral.
  total_points  numeric(6,2),
  tied          boolean not null default false,

  status      athx_result_status not null default 'DRAFT',
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists wod2_event_status_idx on public.wod2_results (event_id, status);

-- ---------------------------------------------------------------------------
-- wod3_results — METCON · FOR TIME · CAP 20:00 (1200 s)
--   Menor tempo válido = melhor. Quem não concluiu grava CAP + volume.
-- ---------------------------------------------------------------------------
create table if not exists public.wod3_results (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events(id) on delete cascade,
  team_id           uuid not null unique references public.teams(id) on delete cascade,
  -- Segundos. A interface recebe MM:SS e converte (§21).
  time_seconds      integer check (time_seconds is null or (time_seconds >= 0 and time_seconds <= 1200)),
  completed         boolean not null default false,
  -- Volume concluído dentro do CAP quando completed = false.
  volume_completed  numeric(8,2) check (volume_completed is null or volume_completed >= 0),
  rank              integer,
  points            numeric(6,2),
  tied              boolean not null default false,
  -- true quando a organização ainda precisa decidir (empate ou DNF sem critério)
  needs_decision    boolean not null default false,

  status      athx_result_status not null default 'DRAFT',
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Quem concluiu precisa ter tempo.
  constraint wod3_completed_needs_time check (not completed or time_seconds is not null)
);

create index if not exists wod3_event_status_idx on public.wod3_results (event_id, status);

-- ---------------------------------------------------------------------------
-- wod_results — resumo por dupla/WOD. É o modelo de leitura do leaderboard:
-- uma única tabela para montar a classificação geral sem varrer tudo (§34).
-- Mantida automaticamente pelas funções de recálculo.
-- ---------------------------------------------------------------------------
create table if not exists public.wod_results (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  wod_number  smallint not null check (wod_number in (1, 2, 3)),
  status      athx_result_status not null default 'DRAFT',
  points      numeric(6,2),
  rank        integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (team_id, wod_number)
);

create index if not exists wod_results_event_idx on public.wod_results (event_id, wod_number);

-- ---------------------------------------------------------------------------
-- audit_logs — §23
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid references public.events(id) on delete set null,
  user_id      uuid,
  user_email   text,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  team_id      uuid references public.teams(id) on delete set null,
  wod_number   smallint check (wod_number is null or wod_number in (1, 2, 3)),
  old_value    jsonb,
  new_value    jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_team_idx on public.audit_logs (team_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function public.athx_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'events', 'teams', 'wod1_results', 'wod2_results', 'wod3_results', 'wod_results'
  ] loop
    execute format(
      'drop trigger if exists %1$s_touch on public.%1$s;
       create trigger %1$s_touch before update on public.%1$s
       for each row execute function public.athx_touch_updated_at();', t);
  end loop;
end $$;


-- ============================================================================
-- >>> 20260901000002_scoring.sql
-- ============================================================================

-- ============================================================================
-- NAÇÃO ATHX · 0002 · Motor de classificação (§25)
--
-- A lógica de ranking NÃO vive só no frontend. Estas funções são a fonte de
-- verdade do banco e espelham exatamente src/lib/scoring/*.ts. Dois
-- administradores não conseguem gerar classificações diferentes porque
-- nenhum dos dois calcula nada: os dois leem o mesmo resultado.
--
-- Regras implementadas aqui (e em nenhum outro lugar):
--   · somente resultados PUBLISHED/LOCKED entram no ranking oficial (§19)
--   · duplas DESCLASSIFICADAS ficam fora do ranking
--   · empate numérico exato -> mesma posição (1º, 1º, 3º) + flag `tied` (§26)
--   · conversão posição->pontos conforme event_settings.tie_points_mode
--   · ordenação de quem não concluiu o WOD 3 conforme event_settings.dnf_policy
--     (nunca assumida silenciosamente — §13/§48)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Converte posição + tamanho do grupo empatado em pontos.
--   COMPETITION -> pontos = posição            (1, 1, 3)
--   AVERAGE     -> pontos = média das posições (1.5, 1.5, 3)
-- ---------------------------------------------------------------------------
drop function if exists public.athx_points_for(integer, integer, athx_tie_points_mode);

-- rank() e count() das janelas devolvem bigint — a assinatura acompanha.
create or replace function public.athx_points_for(
  p_rank bigint,
  p_group_size bigint,
  p_mode athx_tie_points_mode
) returns numeric
language sql
immutable
as $$
  select case
    when p_mode = 'AVERAGE' and p_group_size > 1
      then p_rank + (p_group_size - 1) / 2.0
    else p_rank::numeric
  end;
$$;

-- ---------------------------------------------------------------------------
-- WOD 1 — maior total de cargas = melhor posição
-- ---------------------------------------------------------------------------
create or replace function public.athx_recalculate_wod1(p_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode athx_tie_points_mode;
begin
  select tie_points_mode into v_mode from event_settings where event_id = p_event;
  v_mode := coalesce(v_mode, 'COMPETITION');

  -- Zera todo mundo do evento antes de repontuar.
  update wod1_results set rank = null, points = null, tied = false
  where event_id = p_event and (rank is not null or points is not null or tied);

  with eligible as (
    select w.team_id, w.total_load
    from wod1_results w
    join teams t on t.id = w.team_id
    where w.event_id = p_event
      and w.status in ('PUBLISHED', 'LOCKED')
      and t.status <> 'DESCLASSIFICADA'
      and (w.strict_press_athlete_1 is not null or w.strict_press_athlete_2 is not null
        or w.back_squat_athlete_1 is not null or w.back_squat_athlete_2 is not null
        or w.deadlift_athlete_1 is not null or w.deadlift_athlete_2 is not null)
  ),
  ranked as (
    select team_id,
           rank() over (order by total_load desc) as rnk,
           count(*) over (partition by total_load) as grp
    from eligible
  )
  update wod1_results w
  set rank = r.rnk,
      points = athx_points_for(r.rnk, r.grp, v_mode),
      tied = r.grp > 1
  from ranked r
  where w.team_id = r.team_id
    and (w.rank is distinct from r.rnk
      or w.points is distinct from athx_points_for(r.rnk, r.grp, v_mode)
      or w.tied is distinct from (r.grp > 1));
end;
$$;

-- ---------------------------------------------------------------------------
-- WOD 2 — três provas, três rankings, pontuação somada
--   2A corrida · 2B bike · 2C soma      (maior = melhor em todas)
-- ---------------------------------------------------------------------------
create or replace function public.athx_recalculate_wod2(p_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode athx_tie_points_mode;
begin
  select tie_points_mode into v_mode from event_settings where event_id = p_event;
  v_mode := coalesce(v_mode, 'COMPETITION');

  update wod2_results
  set rank_run = null, points_run = null,
      rank_bike = null, points_bike = null,
      rank_total = null, points_total = null,
      total_points = null, tied = false
  where event_id = p_event
    and (rank_run is not null or rank_bike is not null or rank_total is not null
      or total_points is not null or tied);

  with eligible as (
    select w.team_id, coalesce(w.run_km, 0) as run_km,
           coalesce(w.bike_km, 0) as bike_km, w.total_km
    from wod2_results w
    join teams t on t.id = w.team_id
    where w.event_id = p_event
      and w.status in ('PUBLISHED', 'LOCKED')
      and t.status <> 'DESCLASSIFICADA'
      and (w.run_km is not null or w.bike_km is not null)
  ),
  ranked as (
    select team_id,
           rank() over (order by run_km desc)   as rank_run,
           count(*) over (partition by run_km)   as grp_run,
           rank() over (order by bike_km desc)  as rank_bike,
           count(*) over (partition by bike_km)  as grp_bike,
           rank() over (order by total_km desc) as rank_total,
           count(*) over (partition by total_km) as grp_total
    from eligible
  )
  update wod2_results w
  set rank_run = r.rank_run,
      points_run = athx_points_for(r.rank_run, r.grp_run, v_mode),
      rank_bike = r.rank_bike,
      points_bike = athx_points_for(r.rank_bike, r.grp_bike, v_mode),
      rank_total = r.rank_total,
      points_total = athx_points_for(r.rank_total, r.grp_total, v_mode),
      -- PONTUAÇÃO DO WOD 2 = 2A + 2B + 2C
      total_points = athx_points_for(r.rank_run, r.grp_run, v_mode)
                   + athx_points_for(r.rank_bike, r.grp_bike, v_mode)
                   + athx_points_for(r.rank_total, r.grp_total, v_mode),
      tied = (r.grp_run > 1 or r.grp_bike > 1 or r.grp_total > 1)
  from ranked r
  where w.team_id = r.team_id
    and (w.rank_run is distinct from r.rank_run
      or w.rank_bike is distinct from r.rank_bike
      or w.rank_total is distinct from r.rank_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- WOD 3 — menor tempo = melhor; incompletos conforme a política configurada
-- ---------------------------------------------------------------------------

-- Conjunto elegível do WOD 3, definido em UM lugar só.
create or replace function public.athx_wod3_eligible(p_event uuid)
returns table (
  team_id uuid,
  time_seconds integer,
  completed boolean,
  volume_completed numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select w.team_id, w.time_seconds, w.completed, w.volume_completed
  from wod3_results w
  join teams t on t.id = w.team_id
  where w.event_id = p_event
    and w.status in ('PUBLISHED', 'LOCKED')
    and t.status <> 'DESCLASSIFICADA'
    and (w.time_seconds is not null or w.completed or w.volume_completed is not null);
$$;

create or replace function public.athx_recalculate_wod3(p_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode      athx_tie_points_mode;
  v_policy    athx_dnf_policy;
  v_finishers integer;
  v_eligible  integer;
  v_dnf       integer;
begin
  select tie_points_mode, dnf_policy into v_mode, v_policy
  from event_settings where event_id = p_event;
  v_mode := coalesce(v_mode, 'COMPETITION');
  v_policy := coalesce(v_policy, 'PENDING_DEFINITION');

  update wod3_results
  set rank = null, points = null, tied = false, needs_decision = false
  where event_id = p_event
    and (rank is not null or points is not null or tied or needs_decision);

  select count(*), count(*) filter (where completed and time_seconds is not null)
    into v_eligible, v_finishers
  from athx_wod3_eligible(p_event);

  v_dnf := v_eligible - v_finishers;

  -- 1) Concluíram: menor tempo primeiro.
  with ranked as (
    select team_id,
           rank() over (order by time_seconds asc) as rnk,
           count(*) over (partition by time_seconds) as grp
    from athx_wod3_eligible(p_event)
    where completed and time_seconds is not null
  )
  update wod3_results w
  set rank = r.rnk,
      points = athx_points_for(r.rnk, r.grp, v_mode),
      tied = r.grp > 1,
      needs_decision = r.grp > 1
  from ranked r
  where w.team_id = r.team_id;

  -- 2) Não concluíram: conforme a política. Nada é inventado.
  if v_dnf > 0 then
    if v_policy = 'VOLUME_DESC' then
      with ranked as (
        select team_id,
               rank() over (order by coalesce(volume_completed, 0) desc) as rnk,
               count(*) over (partition by coalesce(volume_completed, 0)) as grp
        from athx_wod3_eligible(p_event)
        where not (completed and time_seconds is not null)
      )
      update wod3_results w
      set rank = r.rnk + v_finishers,
          points = athx_points_for(r.rnk, r.grp, v_mode) + v_finishers,
          tied = r.grp > 1,
          needs_decision = r.grp > 1
      from ranked r
      where w.team_id = r.team_id;

    elsif v_policy = 'TIED_LAST' then
      -- Todos os incompletos ocupam literalmente a última posição.
      update wod3_results w
      set rank = v_eligible,
          points = v_eligible,
          tied = v_dnf > 1,
          needs_decision = false
      from athx_wod3_eligible(p_event) e
      where w.team_id = e.team_id
        and not (e.completed and e.time_seconds is not null);

    else
      -- PENDING_DEFINITION: atrás dos finalizadores, empatados entre si,
      -- sinalizados para decisão da organização.
      update wod3_results w
      set rank = v_finishers + 1,
          points = athx_points_for((v_finishers + 1)::bigint, v_dnf::bigint, v_mode),
          tied = v_dnf > 1,
          needs_decision = true
      from athx_wod3_eligible(p_event) e
      where w.team_id = e.team_id
        and not (e.completed and e.time_seconds is not null);
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sincroniza o resumo wod_results (modelo de leitura do leaderboard)
-- ---------------------------------------------------------------------------
create or replace function public.athx_sync_wod_results(p_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into wod_results (event_id, team_id, wod_number, status, points, rank)
  select event_id, team_id, 1, status, points, rank from wod1_results where event_id = p_event
  union all
  select event_id, team_id, 2, status, total_points, rank_total from wod2_results where event_id = p_event
  union all
  select event_id, team_id, 3, status, points, rank from wod3_results where event_id = p_event
  on conflict (team_id, wod_number) do update
    set status = excluded.status,
        points = excluded.points,
        rank = excluded.rank,
        updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Recálculo completo do evento — chamado ao publicar ou alterar (§25)
-- ---------------------------------------------------------------------------
create or replace function public.athx_recalculate_event(p_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform athx_recalculate_wod1(p_event);
  perform athx_recalculate_wod2(p_event);
  perform athx_recalculate_wod3(p_event);
  perform athx_sync_wod_results(p_event);
end;
$$;

-- ---------------------------------------------------------------------------
-- Rede de segurança: qualquer escrita em resultado dispara o recálculo.
-- O guard de profundidade impede recursão (a própria função escreve na tabela).
-- ---------------------------------------------------------------------------
create or replace function public.athx_on_result_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event uuid;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  v_event := coalesce(
    case when tg_op = 'DELETE' then old.event_id else new.event_id end,
    case when tg_op = 'DELETE' then null else old.event_id end
  );

  if v_event is not null then
    perform athx_recalculate_event(v_event);
  end if;

  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['wod1_results', 'wod2_results', 'wod3_results'] loop
    execute format(
      'drop trigger if exists %1$s_recalc on public.%1$s;
       create trigger %1$s_recalc after insert or update or delete on public.%1$s
       for each row execute function public.athx_on_result_change();', t);
  end loop;
end $$;

-- Mudar tie_points_mode ou dnf_policy também repontua tudo.
create or replace function public.athx_on_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tie_points_mode is distinct from old.tie_points_mode
     or new.dnf_policy is distinct from old.dnf_policy then
    perform athx_recalculate_event(new.event_id);
  end if;
  return null;
end;
$$;

drop trigger if exists event_settings_recalc on public.event_settings;
create trigger event_settings_recalc after update on public.event_settings
for each row execute function public.athx_on_settings_change();


-- ============================================================================
-- >>> 20260901000003_views.sql
-- ============================================================================

-- ============================================================================
-- NAÇÃO ATHX · 0003 · Modelo de leitura
--
-- O leaderboard público é servido por estas views. Uma consulta, sem varrer
-- o banco inteiro a cada atualização (§34).
--
-- DROP antes de CREATE, e não CREATE OR REPLACE:
-- o Postgres recusa remover ou trocar o tipo de uma coluna existente de uma
-- view. Quando uma migration posterior acrescenta colunas (como a 0007 fez
-- na athx_public_wod1), reexecutar este arquivo tentaria devolver a view à
-- forma antiga e falharia com "cannot drop columns from view" — quebrando a
-- reinstalação por cima de um banco já em produção.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- athx_standings — CLASSIFICAÇÃO GERAL (§14)
--
--   TOTAL = Pts WOD 1 + Pts WOD 2 + Pts WOD 3 · menor total = melhor posição
--
-- ORDENAÇÃO, nesta ordem:
--   1) scored_wods DESC — quantos WODs a dupla já tem pontuados
--   2) total_points ASC — a soma
--
-- A primeira chave existe por integridade, não por regra esportiva: somando
-- apenas o que existe, uma dupla com 1 WOD lançado teria total menor e
-- apareceria à frente de quem já fez 3. Idêntico a computeStandings() em
-- src/lib/scoring/overall.ts. Documentado em docs/regras-pendentes.md.
-- ---------------------------------------------------------------------------
drop view if exists public.athx_standings;
create view public.athx_standings as
with scored as (
  select
    t.id            as team_id,
    t.event_id,
    t.team_number,
    t.team_name,
    t.category,
    t.athlete_1,
    t.athlete_2,
    t.battery,
    t.status        as team_status,
    r1.points       as wod1_points,
    r1.rank         as wod1_rank,
    r2.points       as wod2_points,
    r2.rank         as wod2_rank,
    r3.points       as wod3_points,
    r3.rank         as wod3_rank,
    coalesce(r1.points, 0) + coalesce(r2.points, 0) + coalesce(r3.points, 0) as total_points,
    (r1.points is not null)::int
      + (r2.points is not null)::int
      + (r3.points is not null)::int as scored_wods
  from public.teams t
  left join public.wod_results r1 on r1.team_id = t.id and r1.wod_number = 1
  left join public.wod_results r2 on r2.team_id = t.id and r2.wod_number = 2
  left join public.wod_results r3 on r3.team_id = t.id and r3.wod_number = 3
  where t.status <> 'DESCLASSIFICADA'
)
select
  s.*,
  rank() over (
    partition by s.event_id
    order by s.scored_wods desc, s.total_points asc
  ) as position,
  rank() over (
    partition by s.event_id, s.category
    order by s.scored_wods desc, s.total_points asc
  ) as category_position,
  (
    count(*) over (partition by s.event_id, s.scored_wods, s.total_points) > 1
    and s.scored_wods > 0
  ) as tied
from scored s;

-- ---------------------------------------------------------------------------
-- athx_public_wod1 / _wod2 / _wod3 — resultados por WOD já homologados.
-- Usadas pelas páginas /wod/1, /wod/2 e /wod/3.
-- ---------------------------------------------------------------------------
drop view if exists public.athx_public_wod1;
create view public.athx_public_wod1 as
select
  t.id as team_id, t.event_id, t.team_number, t.team_name, t.category, t.battery,
  t.athlete_1, t.athlete_2,
  w.strict_press_athlete_1, w.strict_press_athlete_2,
  w.back_squat_athlete_1, w.back_squat_athlete_2,
  w.deadlift_athlete_1, w.deadlift_athlete_2,
  coalesce(w.strict_press_athlete_1, 0) + coalesce(w.strict_press_athlete_2, 0) as strict_press_total,
  coalesce(w.back_squat_athlete_1, 0) + coalesce(w.back_squat_athlete_2, 0) as back_squat_total,
  coalesce(w.deadlift_athlete_1, 0) + coalesce(w.deadlift_athlete_2, 0) as deadlift_total,
  w.total_load, w.rank, w.points, w.tied, w.status, w.updated_at
from public.wod1_results w
join public.teams t on t.id = w.team_id
where w.status in ('PUBLISHED', 'LOCKED');

drop view if exists public.athx_public_wod2;
create view public.athx_public_wod2 as
select
  t.id as team_id, t.event_id, t.team_number, t.team_name, t.category, t.battery,
  t.athlete_1, t.athlete_2,
  w.run_km, w.bike_km, w.total_km,
  w.rank_run, w.points_run, w.rank_bike, w.points_bike,
  w.rank_total, w.points_total, w.total_points, w.tied, w.status, w.updated_at
from public.wod2_results w
join public.teams t on t.id = w.team_id
where w.status in ('PUBLISHED', 'LOCKED');

drop view if exists public.athx_public_wod3;
create view public.athx_public_wod3 as
select
  t.id as team_id, t.event_id, t.team_number, t.team_name, t.category, t.battery,
  t.athlete_1, t.athlete_2,
  w.time_seconds, w.completed, w.volume_completed,
  w.rank, w.points, w.tied, w.needs_decision, w.status, w.updated_at
from public.wod3_results w
join public.teams t on t.id = w.team_id
where w.status in ('PUBLISHED', 'LOCKED');

-- ---------------------------------------------------------------------------
-- athx_last_update — "Última atualização HH:MM" do leaderboard (§9)
-- ---------------------------------------------------------------------------
drop view if exists public.athx_last_update;
create view public.athx_last_update as
select
  e.id as event_id,
  greatest(
    coalesce((select max(updated_at) from public.wod1_results where event_id = e.id and status in ('PUBLISHED','LOCKED')), e.updated_at),
    coalesce((select max(updated_at) from public.wod2_results where event_id = e.id and status in ('PUBLISHED','LOCKED')), e.updated_at),
    coalesce((select max(updated_at) from public.wod3_results where event_id = e.id and status in ('PUBLISHED','LOCKED')), e.updated_at)
  ) as last_update
from public.events e;


-- ============================================================================
-- >>> 20260901000004_rls.sql
-- ============================================================================

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
declare
  -- Colunas que o MOTOR escreve, não o juiz.
  v_derivadas text[] := array[
    'rank', 'points', 'tied', 'needs_decision', 'total_points', 'total_load', 'total_km',
    'rank_run', 'points_run', 'rank_bike', 'points_bike', 'rank_total', 'points_total',
    'updated_at'
  ];
begin
  if old.status <> 'LOCKED' then
    return new;
  end if;

  -- Destravamento explícito, via athx_unlock_result().
  if coalesce(current_setting('athx.allow_locked_edit', true), 'off') = 'on' then
    return new;
  end if;

  -- O RECÁLCULO PRECISA PASSAR.
  -- Travar congela o que foi LANÇADO (cargas, tempos, status) — não congela
  -- a classificação. Quando o WOD 3 é publicado, o motor reescreve posição e
  -- pontos de TODOS os WODs, inclusive os já travados. Sem esta exceção, o
  -- próprio ato de travar falhava: travar dispara o recálculo, que então
  -- esbarrava neste guarda.
  if (to_jsonb(new) - v_derivadas) = (to_jsonb(old) - v_derivadas) then
    return new;
  end if;

  raise exception
    'Resultado LOCKED. Destrave com athx_unlock_result() antes de alterar.'
    using errcode = 'check_violation';
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


-- ============================================================================
-- >>> 20260901000005_realtime.sql
-- ============================================================================

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


-- ============================================================================
-- >>> 20260901000006_audit.sql
-- ============================================================================

-- ============================================================================
-- NAÇÃO ATHX · 0006 · Auditoria (§23)
--
-- Toda alteração de resultado e de dupla fica registrada com valor anterior,
-- valor novo, autor e horário. Exemplo do que a tela de auditoria mostra:
--
--   "Admin alterou WOD 2 da Dupla 07: Bike 8.45 → 8.75 km"
-- ============================================================================

create or replace function public.athx_audit_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wod    smallint := substring(tg_table_name from 'wod(\d)_results')::smallint;
  v_email  text;
  v_action text := tg_op;
  v_team   uuid := case when tg_op = 'DELETE' then old.team_id else new.team_id end;
  v_event  uuid := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  -- Colunas que o MOTOR escreve, não o juiz. Recálculo não é história.
  v_derived text[] := array[
    'rank', 'points', 'tied', 'needs_decision', 'total_points', 'total_load', 'total_km',
    'rank_run', 'points_run', 'rank_bike', 'points_bike', 'rank_total', 'points_total',
    'updated_at', 'updated_by'
  ];
begin
  -- Um recálculo reescreve posição e pontos de todas as duplas. Se NADA além
  -- desses campos mudou, não houve ação humana e não há o que auditar.
  -- Sem este filtro, um evento de 20 duplas geraria milhares de linhas de
  -- ruído e a auditoria deixaria de responder "quem mudou o quê".
  if tg_op = 'UPDATE'
     and (to_jsonb(old) - v_derived) = (to_jsonb(new) - v_derived) then
    return null;
  end if;

  select email into v_email from admin_users where user_id = auth.uid();

  -- Publicação e travamento merecem ação própria no histórico.
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_action := case new.status
      when 'PUBLISHED' then 'PUBLISH'
      when 'LOCKED' then 'LOCK'
      else 'STATUS_CHANGE'
    end;
  end if;

  insert into audit_logs (
    event_id, user_id, user_email, action, entity_type, entity_id,
    team_id, wod_number, old_value, new_value
  ) values (
    v_event, auth.uid(), v_email, v_action, tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    v_team, v_wod,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['wod1_results', 'wod2_results', 'wod3_results'] loop
    execute format(
      'drop trigger if exists %1$s_audit on public.%1$s;
       create trigger %1$s_audit after insert or update or delete on public.%1$s
       for each row execute function public.athx_audit_result();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Duplas também são auditadas (cadastro, edição, desclassificação).
-- ---------------------------------------------------------------------------
create or replace function public.athx_audit_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from admin_users where user_id = auth.uid();

  insert into audit_logs (
    event_id, user_id, user_email, action, entity_type, entity_id,
    team_id, old_value, new_value
  ) values (
    case when tg_op = 'DELETE' then old.event_id else new.event_id end,
    auth.uid(), v_email, tg_op, 'teams',
    case when tg_op = 'DELETE' then old.id else new.id end,
    case when tg_op = 'DELETE' then old.id else new.id end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  return null;
end;
$$;

drop trigger if exists teams_audit on public.teams;
create trigger teams_audit after insert or update or delete on public.teams
for each row execute function public.athx_audit_team();

-- ---------------------------------------------------------------------------
-- athx_audit_feed — histórico legível para a tela /admin/results
-- ---------------------------------------------------------------------------
drop view if exists public.athx_audit_feed;
create view public.athx_audit_feed as
select
  a.id,
  a.created_at,
  a.action,
  a.entity_type,
  a.wod_number,
  coalesce(a.user_email, 'sistema') as author,
  t.team_number,
  t.team_name,
  a.old_value,
  a.new_value
from public.audit_logs a
left join public.teams t on t.id = a.team_id
order by a.created_at desc;

alter view public.athx_audit_feed set (security_invoker = on);
grant select on public.athx_audit_feed to authenticated;


-- ============================================================================
-- >>> 20260901000007_wod1_provas.sql
-- ============================================================================

-- ============================================================================
-- NAÇÃO ATHX · 0007 · WOD 1 com quatro provas pontuadas
--
-- Mudança de regra da organização: o WOD 1 passa a gerar QUATRO pontuações
-- (1A Strict Press, 1B Back Squat, 1C Deadlift e 1D Total), do mesmo jeito
-- que o WOD 2 gera três (2A, 2B, 2C).
--
--   PONTUAÇÃO DO WOD 1 = Pts 1A + Pts 1B + Pts 1C + Pts 1D
--
-- Também: CAP do WOD 1 vai de 15 para 16 minutos (bloco do Deadlift passa a
-- ser 10–16), o que não afeta cálculo — só a descrição nas telas.
--
-- ----------------------------------------------------------------------------
-- ESTA MIGRATION RODA EM BANCO JÁ INSTALADO.
-- Tudo é ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE: nenhum resultado já
-- lançado é perdido. Pode rodar em banco novo ou em banco em produção.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Como o WOD 1 pontua na classificação geral (§48 — a regra fica configurável
-- porque o texto do regulamento e a instrução da organização divergem).
--
--   SUM_ALL     (padrão) 1A + 1B + 1C + 1D — o que a organização pediu
--   TOTAL_ONLY  só a prova 1D — o que diz a frase "a dupla com maior
--               resultado total ficará em 1º lugar no Workout"
-- ---------------------------------------------------------------------------
do $$ begin
  create type athx_wod1_scoring_mode as enum ('SUM_ALL', 'TOTAL_ONLY');
exception when duplicate_object then null; end $$;

alter table public.event_settings
  add column if not exists wod1_scoring_mode athx_wod1_scoring_mode not null default 'SUM_ALL';

-- ---------------------------------------------------------------------------
-- Somas por movimento — calculadas pelo banco, nunca digitadas.
-- ---------------------------------------------------------------------------
alter table public.wod1_results
  add column if not exists strict_press_total numeric(8,2)
    generated always as (
      coalesce(strict_press_athlete_1, 0) + coalesce(strict_press_athlete_2, 0)
    ) stored;

alter table public.wod1_results
  add column if not exists back_squat_total numeric(8,2)
    generated always as (
      coalesce(back_squat_athlete_1, 0) + coalesce(back_squat_athlete_2, 0)
    ) stored;

alter table public.wod1_results
  add column if not exists deadlift_total numeric(8,2)
    generated always as (
      coalesce(deadlift_athlete_1, 0) + coalesce(deadlift_athlete_2, 0)
    ) stored;

-- ---------------------------------------------------------------------------
-- Posição e pontos de cada prova.
--   `rank`   continua sendo a posição na prova 1D
--   `points` continua sendo A PONTUAÇÃO DO WOD (agora a soma das quatro),
--            que é o que a classificação geral consome
-- ---------------------------------------------------------------------------
alter table public.wod1_results add column if not exists rank_strict_press integer;
alter table public.wod1_results add column if not exists points_strict_press numeric(6,2);
alter table public.wod1_results add column if not exists rank_back_squat integer;
alter table public.wod1_results add column if not exists points_back_squat numeric(6,2);
alter table public.wod1_results add column if not exists rank_deadlift integer;
alter table public.wod1_results add column if not exists points_deadlift numeric(6,2);
alter table public.wod1_results add column if not exists rank_total integer;
alter table public.wod1_results add column if not exists points_total numeric(6,2);

-- ---------------------------------------------------------------------------
-- Motor do WOD 1 — quatro rankings, pontuação somada
-- ---------------------------------------------------------------------------
create or replace function public.athx_recalculate_wod1(p_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode  athx_tie_points_mode;
  v_wod1  athx_wod1_scoring_mode;
begin
  select tie_points_mode, wod1_scoring_mode into v_mode, v_wod1
  from event_settings where event_id = p_event;
  v_mode := coalesce(v_mode, 'COMPETITION');
  v_wod1 := coalesce(v_wod1, 'SUM_ALL');

  update wod1_results
  set rank = null, points = null, tied = false,
      rank_strict_press = null, points_strict_press = null,
      rank_back_squat = null, points_back_squat = null,
      rank_deadlift = null, points_deadlift = null,
      rank_total = null, points_total = null
  where event_id = p_event
    and (rank is not null or points is not null or tied
      or rank_strict_press is not null or rank_back_squat is not null
      or rank_deadlift is not null or rank_total is not null);

  with eligible as (
    select w.team_id, w.strict_press_total, w.back_squat_total,
           w.deadlift_total, w.total_load
    from wod1_results w
    join teams t on t.id = w.team_id
    where w.event_id = p_event
      and w.status in ('PUBLISHED', 'LOCKED')
      and t.status <> 'DESCLASSIFICADA'
      and (w.strict_press_athlete_1 is not null or w.strict_press_athlete_2 is not null
        or w.back_squat_athlete_1 is not null or w.back_squat_athlete_2 is not null
        or w.deadlift_athlete_1 is not null or w.deadlift_athlete_2 is not null)
  ),
  ranked as (
    select team_id,
           rank() over (order by strict_press_total desc) as rk_a,
           count(*) over (partition by strict_press_total)  as gp_a,
           rank() over (order by back_squat_total desc)   as rk_b,
           count(*) over (partition by back_squat_total)    as gp_b,
           rank() over (order by deadlift_total desc)      as rk_c,
           count(*) over (partition by deadlift_total)      as gp_c,
           rank() over (order by total_load desc)          as rk_d,
           count(*) over (partition by total_load)          as gp_d
    from eligible
  )
  update wod1_results w
  set rank_strict_press = r.rk_a,
      points_strict_press = athx_points_for(r.rk_a, r.gp_a, v_mode),
      rank_back_squat = r.rk_b,
      points_back_squat = athx_points_for(r.rk_b, r.gp_b, v_mode),
      rank_deadlift = r.rk_c,
      points_deadlift = athx_points_for(r.rk_c, r.gp_c, v_mode),
      rank_total = r.rk_d,
      points_total = athx_points_for(r.rk_d, r.gp_d, v_mode),
      -- posição de referência do WOD continua sendo a da prova 1D
      rank = r.rk_d,
      -- PONTUAÇÃO DO WOD 1
      points = case
        when v_wod1 = 'TOTAL_ONLY' then athx_points_for(r.rk_d, r.gp_d, v_mode)
        else athx_points_for(r.rk_a, r.gp_a, v_mode)
           + athx_points_for(r.rk_b, r.gp_b, v_mode)
           + athx_points_for(r.rk_c, r.gp_c, v_mode)
           + athx_points_for(r.rk_d, r.gp_d, v_mode)
      end,
      tied = (r.gp_a > 1 or r.gp_b > 1 or r.gp_c > 1 or r.gp_d > 1)
  from ranked r
  where w.team_id = r.team_id
    and (w.rank_total is distinct from r.rk_d
      or w.rank_strict_press is distinct from r.rk_a
      or w.rank_back_squat is distinct from r.rk_b
      or w.rank_deadlift is distinct from r.rk_c);
end;
$$;

-- ---------------------------------------------------------------------------
-- GUARDA DE RESULTADO TRAVADO — agora à prova de colunas novas.
--
-- A versão anterior listava as colunas DERIVADAS e bloqueava todo o resto.
-- Ao acrescentar as oito colunas de posição e pontos das provas do WOD 1, o
-- guarda voltou a barrar o próprio recálculo — e travar deixou de funcionar
-- outra vez. Toda coluna derivada nova reabriria o mesmo buraco.
--
-- Invertendo a lista, o problema acaba: o guarda passa a vigiar apenas o que
-- é DIGITADO POR GENTE (cargas, distâncias, tempo, volume e status). Qualquer
-- coluna calculada, existente ou futura, passa livre.
--
-- >>> Ao criar uma coluna que o JUIZ preenche, acrescente-a aqui. <<<
-- ---------------------------------------------------------------------------
create or replace function public.athx_guard_locked()
returns trigger
language plpgsql
as $$
declare
  v_protegidas text[] := array[
    -- WOD 1
    'strict_press_athlete_1', 'strict_press_athlete_2',
    'back_squat_athlete_1', 'back_squat_athlete_2',
    'deadlift_athlete_1', 'deadlift_athlete_2',
    -- WOD 2
    'run_km', 'bike_km',
    -- WOD 3
    'time_seconds', 'completed', 'volume_completed',
    -- homologação
    'status'
  ];
  v_campo text;
  v_old jsonb;
  v_new jsonb;
begin
  if old.status <> 'LOCKED' then
    return new;
  end if;

  -- Destravamento explícito, via athx_unlock_result().
  if coalesce(current_setting('athx.allow_locked_edit', true), 'off') = 'on' then
    return new;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  foreach v_campo in array v_protegidas loop
    if (v_old -> v_campo) is distinct from (v_new -> v_campo) then
      raise exception
        'Resultado LOCKED. Destrave com athx_unlock_result() antes de alterar.'
        using errcode = 'check_violation';
    end if;
  end loop;

  -- Só mudou coluna calculada: é o motor de classificação trabalhando.
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trocar o modo de pontuação do WOD 1 também repontua tudo.
-- ---------------------------------------------------------------------------
create or replace function public.athx_on_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tie_points_mode is distinct from old.tie_points_mode
     or new.dnf_policy is distinct from old.dnf_policy
     or new.wod1_scoring_mode is distinct from old.wod1_scoring_mode then
    perform athx_recalculate_event(new.event_id);
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- View pública do WOD 1 com as quatro provas
--
-- DROP antes do CREATE: as somas por movimento deixaram de ser expressão solta
-- na view e viraram coluna gerada com escala definida (numeric(8,2)).
-- CREATE OR REPLACE VIEW não consegue mudar o tipo de uma coluna existente.
-- ---------------------------------------------------------------------------
drop view if exists public.athx_public_wod1;

create view public.athx_public_wod1 as
select
  t.id as team_id, t.event_id, t.team_number, t.team_name, t.category, t.battery,
  t.athlete_1, t.athlete_2,
  w.strict_press_athlete_1, w.strict_press_athlete_2,
  w.back_squat_athlete_1, w.back_squat_athlete_2,
  w.deadlift_athlete_1, w.deadlift_athlete_2,
  w.strict_press_total, w.rank_strict_press, w.points_strict_press,
  w.back_squat_total,   w.rank_back_squat,   w.points_back_squat,
  w.deadlift_total,     w.rank_deadlift,     w.points_deadlift,
  w.total_load,         w.rank_total,        w.points_total,
  w.rank, w.points, w.tied, w.status, w.updated_at
from public.wod1_results w
join public.teams t on t.id = w.team_id
where w.status in ('PUBLISHED', 'LOCKED');

alter view public.athx_public_wod1 set (security_invoker = on);
grant select on public.athx_public_wod1 to anon, authenticated;

-- Repontua com a regra nova o que já estiver lançado.
do $$
declare v_event uuid;
begin
  for v_event in select id from public.events loop
    perform public.athx_recalculate_event(v_event);
  end loop;
end $$;


-- ============================================================================
-- >>> 20260901000009_distancia_livre.sql
-- ============================================================================

-- ============================================================================
-- NAÇÃO ATHX · 0009 · WOD 2 aceita qualquer distância
--
-- A troca entre os atletas da corrida acontece a cada 500 m — isso é regra de
-- pista, dita no briefing e cobrada pelo juiz.
--
-- Mas a DISTÂNCIA REGISTRADA é outra coisa: o AMRAP para no minuto 22, no
-- meio de um trecho. Uma dupla pode terminar com 2.410 m de corrida e 2.590 m
-- de bike. Exigir múltiplo de 500 no lançamento tornava impossível registrar
-- o resultado real.
--
-- ----------------------------------------------------------------------------
-- RODA EM BANCO JÁ INSTALADO. Não apaga nada: só remove a trava e recoloca
-- a única regra que continua valendo — distância não pode ser negativa.
-- ============================================================================

alter table public.wod2_results
  drop constraint if exists wod2_results_run_km_check;

alter table public.wod2_results
  add constraint wod2_results_run_km_check
  check (run_km is null or run_km >= 0);

comment on column public.wod2_results.run_km is
  'Distância de corrida em km. Valor livre: o AMRAP para no meio de um trecho.';


-- ============================================================================
-- >>> seed.sql
-- ============================================================================

-- ============================================================================
-- NAÇÃO ATHX · SEED (§36)
--
-- Cria o evento e as 20 duplas numeradas.
--
-- NOMES DOS ATLETAS FICAM VAZIOS de propósito — a organização preenche em
-- /admin/teams. Nenhum nome real é inventado aqui.
--
-- CATEGORIA: as três categorias do evento são
--     Dupla Masculina · Dupla Feminina · Dupla Mista
-- O enum exige um valor, então todas entram como MISTA.
-- >>> A organização DEVE revisar a categoria de cada dupla em /admin/teams
--     antes do evento. Não há como adivinhar isso. <<<
--
-- BATERIA: duplas 1–10 na bateria 1, 11–20 na bateria 2 (§37 prevê duas
-- baterias por WOD). Ajustável no admin.
--
-- Idempotente: pode rodar quantas vezes quiser.
-- ============================================================================

insert into public.events (slug, name, date, status)
values (
  'nacao-celebration-setembro-amarelo',
  'Nação Celebration — Nação ATHX',
  date '2026-09-12',
  'LIVE'
)
on conflict (slug) do update
  set name = excluded.name,
      date = excluded.date;

insert into public.event_settings (event_id)
select id from public.events where slug = 'nacao-celebration-setembro-amarelo'
on conflict (event_id) do nothing;

insert into public.teams (event_id, team_number, team_name, category, athlete_1, athlete_2, battery, status)
select
  e.id,
  n,
  'Dupla ' || lpad(n::text, 2, '0'),
  'MISTA'::athx_category,
  '',
  '',
  case when n <= 10 then 1 else 2 end,
  'INSCRITA'::athx_team_status
from public.events e
cross join generate_series(1, 20) as n
where e.slug = 'nacao-celebration-setembro-amarelo'
on conflict (event_id, team_number) do nothing;


-- ============================================================================
-- FIM. Confirmação rápida do que foi criado.
-- ============================================================================

do $$
declare
  v_duplas integer;
  v_evento text;
begin
  select count(*) into v_duplas from public.teams;
  select name into v_evento from public.events limit 1;

  raise notice '';
  raise notice '========================================================';
  raise notice '  NAÇÃO ATHX — banco instalado com sucesso';
  raise notice '  Evento: %', coalesce(v_evento, '(nenhum)');
  raise notice '  Duplas cadastradas: %', v_duplas;
  raise notice '';
  raise notice '  PRÓXIMO PASSO:';
  raise notice '  1) crie seu usuario em Authentication > Users';
  raise notice '  2) rode o arquivo supabase/tornar-admin.sql';
  raise notice '========================================================';
  raise notice '';
end $$;
