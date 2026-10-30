-- ============================================================================
-- NAÇÃO ATHX · 0013 · O motor de pontuação em SQL, para o modelo genérico
--
-- Espelha src/lib/scoring/motor.ts e src/lib/scoring/overall.ts (§25).
--
-- Tudo é VIEW. O modelo antigo materializava posição e pontos em colunas e
-- usava gatilhos para mantê-las, o que rendeu três bugs seguidos: o guarda
-- de resultado travado barrava o próprio recálculo, a auditoria era inundada
-- pelo recálculo, e cada coluna derivada nova precisava ser lembrada em três
-- listas. Calculando na leitura, não existe o que dessincronizar.
--
-- A cadeia é:
--
--   athx_valores        valor bruto de cada prova (soma de atletas, soma de
--                       outras provas, ou o número lançado)
--   athx_prova_scores   posição e pontos de cada prova, por categoria
--   athx_wod_scores     total de cada WOD
--   athx_standings      a classificação, geral e por categoria
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Prova calculada só pode somar provas LANÇADAS.
--
-- Soma de soma abriria recursão, e o SQL resolveria em um nível enquanto o
-- TypeScript resolveria em todos — os dois motores discordariam. O formulário
-- já não oferece, e aqui o banco recusa.
-- ---------------------------------------------------------------------------
create or replace function public.athx_check_componentes()
returns trigger
language plpgsql
as $$
declare
  v_ruim text;
begin
  if new.origem <> 'SOMA' then
    return new;
  end if;

  select c.codigo into v_ruim
  from public.provas c
  where c.wod_id = new.wod_id
    and c.codigo = any(new.componentes)
    and c.origem <> 'DIGITADA'
  limit 1;

  if v_ruim is not null then
    raise exception 'A prova % é calculada e não pode entrar na soma de %. Some apenas provas lançadas.', v_ruim, new.codigo
      using errcode = 'check_violation';
  end if;

  -- Componente que não existe no WOD é erro de digitação, não escolha.
  select x into v_ruim
  from unnest(new.componentes) as x
  where not exists (
    select 1 from public.provas c where c.wod_id = new.wod_id and c.codigo = x
  )
  limit 1;

  if v_ruim is not null then
    raise exception 'A prova % não existe neste WOD.', v_ruim
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists provas_componentes on public.provas;
create trigger provas_componentes before insert or update on public.provas
for each row execute function public.athx_check_componentes();

-- ---------------------------------------------------------------------------
-- athx_valores — o número que vai para o ranking
-- ---------------------------------------------------------------------------
drop view if exists public.athx_standings cascade;
drop view if exists public.athx_wod_scores cascade;
drop view if exists public.athx_prova_scores cascade;
drop view if exists public.athx_valores cascade;

create view public.athx_valores as
with digitadas as (
  select
    w.event_id,
    p.id as prova_id,
    r.team_id,
    case
      when p.por_atleta then
        case
          when r.valor_atleta_1 is null and r.valor_atleta_2 is null then null
          else round(coalesce(r.valor_atleta_1, 0) + coalesce(r.valor_atleta_2, 0), 3)
        end
      else round(r.valor, 3)
    end as valor
  from public.prova_results r
  join public.provas p on p.id = r.prova_id
  join public.wods w on w.id = p.wod_id
  where p.origem = 'DIGITADA'
),
somas as (
  select
    w.event_id,
    p.id as prova_id,
    d.team_id,
    -- Sem nenhuma parcela lançada, a soma não existe — é diferente de zero.
    case when bool_or(d.valor is not null)
         then round(sum(coalesce(d.valor, 0)), 3)
         else null end as valor
  from public.provas p
  join public.wods w on w.id = p.wod_id
  join public.provas c on c.wod_id = p.wod_id and c.codigo = any(p.componentes)
  join digitadas d on d.prova_id = c.id
  where p.origem = 'SOMA'
  group by w.event_id, p.id, d.team_id
)
select event_id, prova_id, team_id, valor from digitadas
union all
select event_id, prova_id, team_id, valor from somas;

comment on view public.athx_valores is
  'Valor bruto de cada prova por dupla: soma dos atletas, soma de outras provas, ou o número lançado.';

-- ---------------------------------------------------------------------------
-- athx_prova_scores — posição e pontos de cada prova, DENTRO DA CATEGORIA
-- ---------------------------------------------------------------------------
create view public.athx_prova_scores as
with cfg as (
  select event_id,
         coalesce(tie_points_mode, 'COMPETITION')::athx_tie_points_mode as modo,
         coalesce(dnf_policy, 'PENDING_DEFINITION')::athx_dnf_policy as politica
  from public.event_settings
),
elegiveis as (
  select
    w.event_id,
    p.id   as prova_id,
    p.direcao,
    t.id   as team_id,
    t.category,
    v.valor,
    w.permite_cap,
    coalesce(e.concluiu, false) as concluiu,
    e.volume
  from public.provas p
  join public.wods w on w.id = p.wod_id
  join public.teams t on t.event_id = w.event_id
  join public.wod_entries e on e.wod_id = w.id and e.team_id = t.id
  left join public.athx_valores v on v.prova_id = p.id and v.team_id = t.id
  where t.status <> 'DESCLASSIFICADA'
    and e.status in ('PUBLISHED', 'LOCKED')
    -- Workout com CAP: quem não concluiu entra mesmo sem valor, pelo volume.
    and (
      v.valor is not null
      or (w.permite_cap and not coalesce(e.concluiu, false) and e.volume is not null)
    )
),
-- Quem disputa pelo valor: todo mundo, ou só quem concluiu em WOD com CAP.
concluiram as (
  select * from elegiveis
  where not permite_cap or (concluiu and valor is not null)
),
incompletas as (
  select * from elegiveis
  where permite_cap and not (concluiu and valor is not null)
),
contagem as (
  select prova_id, category,
         count(*) filter (where true) as n_elegiveis,
         count(*) filter (where not permite_cap or (concluiu and valor is not null)) as n_concluiram,
         count(*) filter (where permite_cap and not (concluiu and valor is not null)) as n_incompletas
  from elegiveis
  group by prova_id, category
),
ranqueadas as (
  select
    c.event_id, c.prova_id, c.team_id, c.category,
    rank() over (
      partition by c.prova_id, c.category
      order by case when c.direcao = 'MAIOR_VENCE' then -c.valor else c.valor end
    ) as rnk,
    count(*) over (partition by c.prova_id, c.category, c.valor) as grp
  from concluiram c
),
finalizadores as (
  select
    r.event_id, r.prova_id, r.team_id, r.category,
    r.rnk as rank,
    athx_points_for(r.rnk, r.grp, cfg.modo) as points,
    r.grp > 1 as tied,
    r.grp > 1 as needs_decision
  from ranqueadas r
  join cfg on cfg.event_id = r.event_id
),
-- Quem não concluiu, conforme a política escolhida (§13/§48). Nada é
-- assumido: a regra vem de event_settings.dnf_policy.
por_volume as (
  select
    i.event_id, i.prova_id, i.team_id, i.category,
    rank() over (partition by i.prova_id, i.category order by coalesce(i.volume, 0) desc) as rnk,
    count(*) over (partition by i.prova_id, i.category, coalesce(i.volume, 0)) as grp,
    n.n_concluiram, n.n_elegiveis, n.n_incompletas
  from incompletas i
  join contagem n on n.prova_id = i.prova_id and n.category = i.category
),
nao_concluiram as (
  select
    v.event_id, v.prova_id, v.team_id, v.category,
    case cfg.politica
      when 'VOLUME_DESC' then v.rnk + v.n_concluiram
      when 'TIED_LAST'   then v.n_elegiveis
      else v.n_concluiram + 1
    end as rank,
    case cfg.politica
      when 'VOLUME_DESC' then athx_points_for(v.rnk, v.grp, cfg.modo) + v.n_concluiram
      when 'TIED_LAST'   then v.n_elegiveis::numeric
      else athx_points_for((v.n_concluiram + 1)::bigint, v.n_incompletas::bigint, cfg.modo)
    end as points,
    case cfg.politica
      when 'VOLUME_DESC' then v.grp > 1
      else v.n_incompletas > 1
    end as tied,
    case cfg.politica
      when 'VOLUME_DESC' then v.grp > 1
      when 'TIED_LAST'   then false
      else true
    end as needs_decision
  from por_volume v
  join cfg on cfg.event_id = v.event_id
)
select event_id, prova_id, team_id, category, rank, points, tied, needs_decision
from finalizadores
union all
select event_id, prova_id, team_id, category, rank, points::numeric, tied, needs_decision
from nao_concluiram;

comment on view public.athx_prova_scores is
  'Posição e pontos de cada prova, ranqueados DENTRO DA CATEGORIA. Espelha src/lib/scoring/motor.ts.';

-- ---------------------------------------------------------------------------
-- athx_wod_scores — o total de cada workout
-- ---------------------------------------------------------------------------
create view public.athx_wod_scores as
with por_wod as (
  select
    w.event_id,
    w.id as wod_id,
    t.id as team_id,
    t.category,
    count(*) filter (where p.pontua) as provas_que_pontuam,
    count(s.points) filter (where p.pontua) as provas_pontuadas,
    sum(s.points) filter (where p.pontua) as soma
  from public.wods w
  join public.teams t on t.event_id = w.event_id
  join public.provas p on p.wod_id = w.id
  left join public.athx_prova_scores s on s.prova_id = p.id and s.team_id = t.id
  where t.status <> 'DESCLASSIFICADA'
  group by w.event_id, w.id, t.id, t.category
),
completos as (
  select *,
    -- O WOD só tem total quando TODAS as provas dele foram pontuadas.
    (provas_que_pontuam > 0 and provas_pontuadas = provas_que_pontuam) as tem_resultado
  from por_wod
)
select
  c.event_id, c.wod_id, c.team_id, c.category,
  case when c.tem_resultado then c.soma end as points,
  case when c.tem_resultado then
    rank() over (
      partition by c.wod_id, c.category, c.tem_resultado
      order by c.soma asc
    )
  end as rank,
  c.tem_resultado as has_result,
  e.concluiu,
  e.volume
from completos c
left join public.wod_entries e on e.wod_id = c.wod_id and e.team_id = c.team_id;

comment on view public.athx_wod_scores is
  'Total de cada WOD: a soma das provas que pontuam, com a posição no workout dentro da categoria.';

-- ---------------------------------------------------------------------------
-- athx_standings — a classificação
--
-- `position` (geral) mistura as categorias e é só referência: ninguém
-- disputa contra outra categoria, então ali o desempate não age.
-- `category_position` é a que vale, e é nela que os critérios entram.
-- ---------------------------------------------------------------------------
create view public.athx_standings as
with cfg as (
  select event_id,
         upper(coalesce(tie_breaker_1, 'NENHUM')) as tb1,
         upper(coalesce(tie_breaker_2, 'NENHUM')) as tb2,
         upper(coalesce(tie_breaker_3, 'NENHUM')) as tb3
  from public.event_settings
),
total as (
  select
    w.event_id,
    t.id as team_id,
    coalesce(sum(s.points) filter (where p.pontua), 0) as total_points
  from public.teams t
  join public.wods w on w.event_id = t.event_id
  join public.provas p on p.wod_id = w.id
  left join public.athx_prova_scores s on s.prova_id = p.id and s.team_id = t.id
  where t.status <> 'DESCLASSIFICADA'
  group by w.event_id, t.id
),
completude as (
  select event_id, team_id, count(*) filter (where has_result) as scored_wods
  from public.athx_wod_scores
  group by event_id, team_id
),
-- A pontuação da dupla no WOD de cada critério de desempate.
criterios as (
  select
    t.id as team_id,
    max(ws.points) filter (where ('WOD' || w.numero) = c.tb1) as k1,
    max(ws.points) filter (where ('WOD' || w.numero) = c.tb2) as k2,
    max(ws.points) filter (where ('WOD' || w.numero) = c.tb3) as k3
  from public.teams t
  join public.wods w on w.event_id = t.event_id
  join cfg c on c.event_id = t.event_id
  left join public.athx_wod_scores ws on ws.wod_id = w.id and ws.team_id = t.id and ws.has_result
  group by t.id
),
base as (
  select
    t.id as team_id, t.event_id, t.team_number, t.team_name, t.category,
    t.athlete_1, t.athlete_2, t.battery, t.status as team_status,
    tot.total_points,
    coalesce(comp.scored_wods, 0) as scored_wods,
    k.k1, k.k2, k.k3
  from public.teams t
  join total tot on tot.team_id = t.id
  left join completude comp on comp.team_id = t.id
  left join criterios k on k.team_id = t.id
  where t.status <> 'DESCLASSIFICADA'
)
select
  b.*,
  -- Geral: completude e pontos, e nada mais.
  rank() over (
    partition by b.event_id
    order by b.scored_wods desc, b.total_points asc
  ) as position,
  -- Categoria: é aqui que o desempate decide o pódio.
  rank() over (
    partition by b.event_id, b.category
    order by b.scored_wods desc, b.total_points asc,
             b.k1 asc nulls last, b.k2 asc nulls last, b.k3 asc nulls last
  ) as category_position,
  -- Empate só existe dentro da categoria, e só quando nenhum critério separou.
  (
    count(*) over (
      partition by b.event_id, b.category, b.scored_wods, b.total_points, b.k1, b.k2, b.k3
    ) > 1
    and b.scored_wods > 0
  ) as tied
from base b;

comment on view public.athx_standings is
  'position = classificação geral, sem desempate (referência). category_position = a que vale, com os critérios de event_settings. Espelha src/lib/scoring/overall.ts.';

-- As views rodam com os privilégios de quem consulta, não de quem criou:
-- sem isto elas furariam o RLS.
alter view public.athx_valores      set (security_invoker = on);
alter view public.athx_prova_scores set (security_invoker = on);
alter view public.athx_wod_scores   set (security_invoker = on);
alter view public.athx_standings    set (security_invoker = on);
