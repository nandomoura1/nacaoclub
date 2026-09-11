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
