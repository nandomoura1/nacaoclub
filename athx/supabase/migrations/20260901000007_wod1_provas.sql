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
