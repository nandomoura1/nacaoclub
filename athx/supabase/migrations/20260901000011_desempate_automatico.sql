-- ============================================================================
-- NAÇÃO ATHX · 0011 · O critério de desempate passa a ser APLICADO
--
-- Os campos tie_breaker_1/2/3 sempre existiram, mas só REGISTRAVAM a regra:
-- a organização escrevia "melhor colocação no WOD 3" e a classificação
-- continuava mostrando EMPATE. Nada aplicava aquilo.
--
-- Agora eles guardam um CÓDIGO, e tanto o app quanto o banco ordenam por ele:
--
--   NENHUM   duplas empatadas dividem a posição e a decisão é da organização
--   WOD3     melhor colocação no WOD 3 desempata
--   WOD2     melhor colocação no WOD 2 desempata
--   WOD1     melhor colocação no WOD 1 desempata
--
-- Os três são consultados em ordem: o 2 só entra quando o 1 também empata.
-- "Melhor colocação no WOD" = menor pontuação naquele workout.
--
-- Espelha src/lib/scoring/overall.ts (§25).
--
-- ----------------------------------------------------------------------------
-- OPCIONAL PARA O APP. O leaderboard, o admin e a exportação calculam a
-- classificação em TypeScript a partir das tabelas cruas — nenhum deles lê
-- esta view. Rodar isto serve para o BANCO não discordar do app quando
-- alguém consultar athx_standings direto no SQL Editor.
--
-- O que NÃO é opcional é escolher o critério em /admin/settings: é de lá que
-- vem o código que estas duas implementações leem.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Texto livre da versão anterior vira NENHUM.
--
-- O sistema não adivinha o que a frase queria dizer. A organização reescolhe
-- na lista — são três cliques — e aí passa a valer de verdade. Converter na
-- base do palpite seria inventar a regra que este projeto se recusa a
-- inventar (§48).
-- ---------------------------------------------------------------------------
do $$
declare
  v_legado text;
begin
  select string_agg(distinct t, ' · ') into v_legado
  from (
    select unnest(array[tie_breaker_1, tie_breaker_2, tie_breaker_3]) as t
    from public.event_settings
  ) x
  where t is not null
    and btrim(t) <> ''
    and upper(btrim(t)) not in ('NENHUM', 'WOD1', 'WOD2', 'WOD3');

  if v_legado is not null then
    raise notice 'NAÇÃO ATHX · critério antigo em texto livre encontrado: %', v_legado;
    raise notice 'NAÇÃO ATHX · escolha o critério em /admin/settings para ele passar a valer';
  end if;
end;
$$;

update public.event_settings
set tie_breaker_1 = case when upper(btrim(coalesce(tie_breaker_1, ''))) in ('NENHUM','WOD1','WOD2','WOD3')
                         then upper(btrim(tie_breaker_1)) else 'NENHUM' end,
    tie_breaker_2 = case when upper(btrim(coalesce(tie_breaker_2, ''))) in ('NENHUM','WOD1','WOD2','WOD3')
                         then upper(btrim(tie_breaker_2)) else 'NENHUM' end,
    tie_breaker_3 = case when upper(btrim(coalesce(tie_breaker_3, ''))) in ('NENHUM','WOD1','WOD2','WOD3')
                         then upper(btrim(tie_breaker_3)) else 'NENHUM' end;

alter table public.event_settings
  alter column tie_breaker_1 set default 'NENHUM',
  alter column tie_breaker_2 set default 'NENHUM',
  alter column tie_breaker_3 set default 'NENHUM';

alter table public.event_settings
  drop constraint if exists event_settings_tie_breakers_check;

alter table public.event_settings
  add constraint event_settings_tie_breakers_check check (
    coalesce(tie_breaker_1, 'NENHUM') in ('NENHUM','WOD1','WOD2','WOD3') and
    coalesce(tie_breaker_2, 'NENHUM') in ('NENHUM','WOD1','WOD2','WOD3') and
    coalesce(tie_breaker_3, 'NENHUM') in ('NENHUM','WOD1','WOD2','WOD3')
  );

comment on column public.event_settings.tie_breaker_1 is
  'Critério de desempate aplicado primeiro: NENHUM, WOD1, WOD2 ou WOD3.';

-- ---------------------------------------------------------------------------
-- athx_standings — a ordenação passa a consultar os critérios.
--
-- Cada critério vira uma chave de ordenação: a pontuação da dupla no WOD
-- escolhido, com NULLS LAST (sem resultado naquele WOD vai para trás, igual
-- ao motor TypeScript).
--
-- `tied` também muda de sentido: duas duplas só continuam empatadas quando
-- nenhum dos critérios as separou.
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
      + (r3.points is not null)::int as scored_wods,
    -- As três chaves de desempate, já resolvidas para números.
    case s.tie_breaker_1 when 'WOD1' then r1.points when 'WOD2' then r2.points
                         when 'WOD3' then r3.points else null end as tb1,
    case s.tie_breaker_2 when 'WOD1' then r1.points when 'WOD2' then r2.points
                         when 'WOD3' then r3.points else null end as tb2,
    case s.tie_breaker_3 when 'WOD1' then r1.points when 'WOD2' then r2.points
                         when 'WOD3' then r3.points else null end as tb3
  from public.teams t
  left join public.event_settings s on s.event_id = t.event_id
  left join public.wod_results r1 on r1.team_id = t.id and r1.wod_number = 1
  left join public.wod_results r2 on r2.team_id = t.id and r2.wod_number = 2
  left join public.wod_results r3 on r3.team_id = t.id and r3.wod_number = 3
  where t.status <> 'DESCLASSIFICADA'
)
select
  s.team_id, s.event_id, s.team_number, s.team_name, s.category,
  s.athlete_1, s.athlete_2, s.battery, s.team_status,
  s.wod1_points, s.wod1_rank, s.wod2_points, s.wod2_rank,
  s.wod3_points, s.wod3_rank, s.total_points, s.scored_wods,
  rank() over (
    partition by s.event_id
    order by s.scored_wods desc, s.total_points asc,
             s.tb1 asc nulls last, s.tb2 asc nulls last, s.tb3 asc nulls last
  ) as position,
  rank() over (
    partition by s.event_id, s.category
    order by s.scored_wods desc, s.total_points asc,
             s.tb1 asc nulls last, s.tb2 asc nulls last, s.tb3 asc nulls last
  ) as category_position,
  (
    count(*) over (
      partition by s.event_id, s.scored_wods, s.total_points, s.tb1, s.tb2, s.tb3
    ) > 1
    and s.scored_wods > 0
  ) as tied
from scored s;

-- Recriar a view apaga a marcação de segurança que a 0004 aplicou: sem ela,
-- a view roda com os privilégios de quem a criou e furaria o RLS.
alter view public.athx_standings set (security_invoker = on);

comment on view public.athx_standings is
  'Classificação com os critérios de desempate de event_settings aplicados. Espelha src/lib/scoring/overall.ts.';
