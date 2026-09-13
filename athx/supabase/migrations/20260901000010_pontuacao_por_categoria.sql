-- ============================================================================
-- NAÇÃO ATHX · 0010 · A pontuação é disputada DENTRO DA CATEGORIA
--
-- Até aqui, as oito provas (1A 1B 1C 1D 2A 2B 2C 3) eram ranqueadas com as
-- 20 duplas juntas. Isso fazia a pontuação de uma dupla depender do tamanho
-- e da força das OUTRAS categorias: uma dupla feminina podia terminar com 14
-- pontos numa prova mesmo sendo a 2ª entre as femininas.
--
-- A regra correta, dita pela organização:
--
--     Se a categoria tem 5 duplas, o máximo que uma dupla daquela categoria
--     pode receber numa prova é 5 pontos.
--
-- A mudança é sempre a mesma: toda janela de rank() e de contagem de empate
-- ganha `partition by t.category`. No WOD 3 isso vale também para as
-- contagens que empurram quem não concluiu — "atrás de quem concluiu" passa
-- a significar atrás de quem concluiu NA CATEGORIA.
--
-- Espelha src/lib/scoring/categoria.ts (§25).
--
-- ----------------------------------------------------------------------------
-- RODA EM BANCO JÁ INSTALADO. Só troca funções: nenhuma tabela, coluna ou
-- linha é tocada. No fim, repontua o evento inteiro com a regra nova.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- WOD 1 — 1A, 1B, 1C e 1D, cada um ranqueado dentro da categoria
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
    select w.team_id, t.category, w.strict_press_total, w.back_squat_total,
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
           rank() over (partition by category order by strict_press_total desc) as rk_a,
           count(*) over (partition by category, strict_press_total)            as gp_a,
           rank() over (partition by category order by back_squat_total desc)   as rk_b,
           count(*) over (partition by category, back_squat_total)              as gp_b,
           rank() over (partition by category order by deadlift_total desc)     as rk_c,
           count(*) over (partition by category, deadlift_total)                as gp_c,
           rank() over (partition by category order by total_load desc)         as rk_d,
           count(*) over (partition by category, total_load)                    as gp_d
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
      -- PONTUAÇÃO DO WOD 1 = 1A + 1B + 1C + 1D. As quatro provas sempre somam.
      points = athx_points_for(r.rk_a, r.gp_a, v_mode)
             + athx_points_for(r.rk_b, r.gp_b, v_mode)
             + athx_points_for(r.rk_c, r.gp_c, v_mode)
             + athx_points_for(r.rk_d, r.gp_d, v_mode),
      tied = (r.gp_a > 1 or r.gp_b > 1 or r.gp_c > 1 or r.gp_d > 1)
  from ranked r
  where w.team_id = r.team_id
    and (w.rank_total is distinct from r.rk_d
      or w.rank_strict_press is distinct from r.rk_a
      or w.rank_back_squat is distinct from r.rk_b
      or w.rank_deadlift is distinct from r.rk_c
      or w.points is distinct from (
           athx_points_for(r.rk_a, r.gp_a, v_mode)
         + athx_points_for(r.rk_b, r.gp_b, v_mode)
         + athx_points_for(r.rk_c, r.gp_c, v_mode)
         + athx_points_for(r.rk_d, r.gp_d, v_mode)));
end;
$$;

-- ---------------------------------------------------------------------------
-- WOD 2 — 2A, 2B e 2C, cada um ranqueado dentro da categoria
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
    select w.team_id, t.category, coalesce(w.run_km, 0) as run_km,
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
           rank() over (partition by category order by run_km desc)   as rank_run,
           count(*) over (partition by category, run_km)              as grp_run,
           rank() over (partition by category order by bike_km desc)  as rank_bike,
           count(*) over (partition by category, bike_km)             as grp_bike,
           rank() over (partition by category order by total_km desc) as rank_total,
           count(*) over (partition by category, total_km)            as grp_total
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
      or w.rank_total is distinct from r.rank_total
      or w.total_points is distinct from (
           athx_points_for(r.rank_run, r.grp_run, v_mode)
         + athx_points_for(r.rank_bike, r.grp_bike, v_mode)
         + athx_points_for(r.rank_total, r.grp_total, v_mode)));
end;
$$;

-- ---------------------------------------------------------------------------
-- WOD 3 — o conjunto elegível passa a carregar a categoria.
-- Trocar o tipo de retorno exige DROP antes do CREATE.
-- ---------------------------------------------------------------------------
drop function if exists public.athx_wod3_eligible(uuid);

create function public.athx_wod3_eligible(p_event uuid)
returns table (
  team_id uuid,
  category athx_category,
  time_seconds integer,
  completed boolean,
  volume_completed numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select w.team_id, t.category, w.time_seconds, w.completed, w.volume_completed
  from wod3_results w
  join teams t on t.id = w.team_id
  where w.event_id = p_event
    and w.status in ('PUBLISHED', 'LOCKED')
    and t.status <> 'DESCLASSIFICADA'
    and (w.time_seconds is not null or w.completed or w.volume_completed is not null);
$$;

-- ---------------------------------------------------------------------------
-- WOD 3 — ranking e política de incompletos, tudo dentro da categoria.
--
-- Antes, o número de finalizadores era um escalar do evento inteiro. Agora
-- é uma contagem POR CATEGORIA, calculada por janela:
--   n_fin  quantas duplas da categoria concluíram
--   n_cat  quantas duplas da categoria estão no conjunto elegível
--   n_dnf  quantas duplas da categoria não concluíram
-- ---------------------------------------------------------------------------
create or replace function public.athx_recalculate_wod3(p_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode   athx_tie_points_mode;
  v_policy athx_dnf_policy;
begin
  select tie_points_mode, dnf_policy into v_mode, v_policy
  from event_settings where event_id = p_event;
  v_mode := coalesce(v_mode, 'COMPETITION');
  v_policy := coalesce(v_policy, 'PENDING_DEFINITION');

  update wod3_results
  set rank = null, points = null, tied = false, needs_decision = false
  where event_id = p_event
    and (rank is not null or points is not null or tied or needs_decision);

  -- 1) Concluíram: menor tempo primeiro, dentro da categoria.
  with ranked as (
    select team_id,
           rank() over (partition by category order by time_seconds asc) as rnk,
           count(*) over (partition by category, time_seconds) as grp
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

  -- 2) Não concluíram: conforme a política. Nada é inventado (§13/§48).
  if v_policy = 'VOLUME_DESC' then
    with contagem as (
      select *,
             count(*) filter (where completed and time_seconds is not null)
               over (partition by category) as n_fin
      from athx_wod3_eligible(p_event)
    ),
    ranked as (
      select team_id, n_fin,
             rank() over (partition by category order by coalesce(volume_completed, 0) desc) as rnk,
             count(*) over (partition by category, coalesce(volume_completed, 0)) as grp
      from contagem
      where not (completed and time_seconds is not null)
    )
    update wod3_results w
    set rank = r.rnk + r.n_fin,
        points = athx_points_for(r.rnk, r.grp, v_mode) + r.n_fin,
        tied = r.grp > 1,
        needs_decision = r.grp > 1
    from ranked r
    where w.team_id = r.team_id;

  elsif v_policy = 'TIED_LAST' then
    -- Todos os incompletos ocupam a última posição DA CATEGORIA.
    with contagem as (
      select *,
             count(*) over (partition by category) as n_cat,
             count(*) filter (where not (completed and time_seconds is not null))
               over (partition by category) as n_dnf
      from athx_wod3_eligible(p_event)
    )
    update wod3_results w
    set rank = c.n_cat,
        points = c.n_cat,
        tied = c.n_dnf > 1,
        needs_decision = false
    from contagem c
    where w.team_id = c.team_id
      and not (c.completed and c.time_seconds is not null);

  else
    -- PENDING_DEFINITION: atrás dos finalizadores DA CATEGORIA, empatados
    -- entre si, sinalizados para decisão da organização.
    with contagem as (
      select *,
             count(*) filter (where completed and time_seconds is not null)
               over (partition by category) as n_fin,
             count(*) filter (where not (completed and time_seconds is not null))
               over (partition by category) as n_dnf
      from athx_wod3_eligible(p_event)
    )
    update wod3_results w
    set rank = c.n_fin + 1,
        points = athx_points_for((c.n_fin + 1)::bigint, c.n_dnf::bigint, v_mode),
        tied = c.n_dnf > 1,
        needs_decision = true
    from contagem c
    where w.team_id = c.team_id
      and not (c.completed and c.time_seconds is not null);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- BÔNUS · a auditoria para de ser inundada pelo recálculo.
--
-- O filtro que ignora "coluna calculada" listava as colunas derivadas uma a
-- uma. Quando a migration 0007 criou as oito colunas novas do WOD 1
-- (rank_strict_press, points_strict_press, …), elas ficaram de fora da lista
-- e passaram a contar como mudança humana: cada recálculo gravava uma linha
-- de auditoria POR DUPLA. Num evento de 20 duplas isso vira dezenas de
-- milhares de linhas e a tela de auditoria deixa de responder a pergunta que
-- ela existe para responder — quem mudou o quê.
--
-- A lista agora é INVERTIDA, igual à do guarda de resultado travado: vigia
-- só o que é DIGITADO POR GENTE. Coluna calculada nova nunca mais reabre
-- esse buraco, porque ela não precisa ser cadastrada em lugar nenhum.
--
-- >>> Ao criar uma coluna que o JUIZ preenche, acrescente-a aqui. <<<
-- ---------------------------------------------------------------------------
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

  -- O que uma PESSOA digita. Todo o resto é o motor trabalhando.
  v_humanas text[] := array[
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

  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_old
    from jsonb_each(to_jsonb(old)) as e(k, v) where k = any(v_humanas);

    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_new
    from jsonb_each(to_jsonb(new)) as e(k, v) where k = any(v_humanas);

    -- Nenhum campo humano mudou: foi recálculo, não é história.
    if v_old = v_new then
      return null;
    end if;
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

-- ---------------------------------------------------------------------------
-- BÔNUS · conserta "excluir dupla", que estava quebrado em produção.
--
-- O gatilho de auditoria gravava audit_logs.team_id = old.id numa dupla que
-- acabara de deixar de existir, e a própria chave estrangeira derrubava o
-- DELETE. Resultado: o botão "excluir dupla" do admin devolvia erro sempre.
--
-- Nada se perde ao deixar team_id nulo na exclusão: entity_id continua
-- guardando o id da dupla e old_value guarda a linha inteira em jsonb.
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
    -- a dupla já não existe: a FK recusaria o id
    case when tg_op = 'DELETE' then null else new.id end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Repontua tudo que já está lançado, com a regra nova.
-- ---------------------------------------------------------------------------
do $$
declare
  v_event uuid;
begin
  for v_event in select id from public.events loop
    perform public.athx_recalculate_event(v_event);
  end loop;
  raise notice 'NAÇÃO ATHX · pontuação recalculada por categoria';
end;
$$;
