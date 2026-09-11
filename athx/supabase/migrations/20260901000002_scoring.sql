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
