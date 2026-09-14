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
-- A REGRA DESTA ETAPA, decidida pela organização, é WOD3 — e por isso ela
-- passa a ser o PADRÃO da coluna, não algo que alguém precise lembrar de
-- configurar antes do pódio.
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
-- O critério 1 passa a ser WOD3 — a regra que a organização definiu.
--
-- Não é leitura do texto que estava salvo: é a regra dita pela organização,
-- em palavras, fora do sistema. O texto antigo é apenas reportado abaixo
-- para conferência, e continua trocável em /admin/settings.
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
    raise notice 'NAÇÃO ATHX · texto livre encontrado nos campos de desempate: %', v_legado;
    raise notice 'NAÇÃO ATHX · substituído pelo critério do evento: WOD3 (melhor colocação no WOD 3)';
  end if;
end;
$$;

update public.event_settings
-- Código válido é respeitado; qualquer outra coisa (texto livre ou vazio)
-- vira a regra do evento.
set tie_breaker_1 = case when upper(btrim(coalesce(tie_breaker_1, ''))) in ('NENHUM','WOD1','WOD2','WOD3')
                         then upper(btrim(tie_breaker_1)) else 'WOD3' end,
    tie_breaker_2 = case when upper(btrim(coalesce(tie_breaker_2, ''))) in ('NENHUM','WOD1','WOD2','WOD3')
                         then upper(btrim(tie_breaker_2)) else 'NENHUM' end,
    tie_breaker_3 = case when upper(btrim(coalesce(tie_breaker_3, ''))) in ('NENHUM','WOD1','WOD2','WOD3')
                         then upper(btrim(tie_breaker_3)) else 'NENHUM' end;

alter table public.event_settings
  alter column tie_breaker_1 set default 'WOD3',
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
  'Critério de desempate aplicado primeiro: NENHUM, WOD1, WOD2 ou WOD3. Padrão do evento: WOD3.';

-- ---------------------------------------------------------------------------
-- athx_standings — o critério age SÓ na classificação da categoria.
--
-- `position` (geral) mistura as três categorias e existe como referência:
-- ninguém disputa contra outra categoria, então ali duplas com a mesma
-- pontuação dividem a posição e nenhum critério é consultado.
--
-- `category_position` é a classificação que vale, a que vai ao pódio — e é
-- nela que cada critério entra como chave de ordenação: a pontuação da dupla
-- no WOD escolhido, com NULLS LAST (sem resultado naquele WOD vai para trás,
-- igual ao motor TypeScript).
--
-- `tied` acompanha: duas duplas só continuam empatadas quando são da MESMA
-- categoria e nenhum dos critérios as separou.
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
  -- Geral: completude e pontos, e nada mais.
  rank() over (
    partition by s.event_id
    order by s.scored_wods desc, s.total_points asc
  ) as position,
  -- Categoria: é aqui que o desempate decide o pódio.
  rank() over (
    partition by s.event_id, s.category
    order by s.scored_wods desc, s.total_points asc,
             s.tb1 asc nulls last, s.tb2 asc nulls last, s.tb3 asc nulls last
  ) as category_position,
  -- Empate só existe DENTRO da categoria: uma dupla masculina e uma feminina
  -- com o mesmo total não disputam nada entre si.
  (
    count(*) over (
      partition by s.event_id, s.category, s.scored_wods, s.total_points,
                   s.tb1, s.tb2, s.tb3
    ) > 1
    and s.scored_wods > 0
  ) as tied
from scored s;

-- Recriar a view apaga a marcação de segurança que a 0004 aplicou: sem ela,
-- a view roda com os privilégios de quem a criou e furaria o RLS.
alter view public.athx_standings set (security_invoker = on);

comment on view public.athx_standings is
  'position = classificação geral, sem desempate (referência). category_position = a que vale, com os critérios de event_settings aplicados. Espelha src/lib/scoring/overall.ts.';
