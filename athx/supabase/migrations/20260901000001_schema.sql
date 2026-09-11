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
