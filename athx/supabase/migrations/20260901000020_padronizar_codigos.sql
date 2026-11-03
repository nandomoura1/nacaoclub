-- ============================================================================
-- NAÇÃO HÍBRIDA · 0020 · PADRONIZAR OS CÓDIGOS DAS PROVAS
--
-- A conferência do painel aponta código repetido entre WODs e provas com a
-- mesma ordem. Os dois são mecânicos: o código certo de uma prova é o
-- NÚMERO DO SEU WOD mais uma letra, na ordem em que ela aparece.
--
--   WOD 2 -> 2A, 2B, 2C        WOD 3 -> 3A, 3B, 3C        WOD 4 -> 4A
--
-- Corrigir isso na mão, prova por prova, é trabalho de digitação — e cada
-- digitação é uma chance de errar. Esta função faz de uma vez.
--
-- O QUE ELA NÃO MEXE: resultados. Lançamento aponta para o IDENTIFICADOR da
-- prova, não para o código. Renomear 2A para 3A não move nenhum número de
-- lugar — só muda o rótulo da coluna.
--
-- COM p_aplicar = false ela só DEVOLVE o plano, sem gravar. É o que a tela
-- mostra antes de perguntar se pode.
-- ============================================================================

create or replace function public.athx_padronizar_codigos(
  p_event   uuid,
  p_aplicar boolean default false
)
returns table (
  wod        integer,
  de         text,
  para       text,
  ordem_de   integer,
  ordem_para integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mudou boolean := false;
begin
  if not public.athx_is_admin() then
    raise exception 'Apenas a organização pode padronizar os códigos.'
      using errcode = 'insufficient_privilege';
  end if;

  -- O plano: para cada prova, o código e a ordem que ela DEVERIA ter.
  --
  -- A letra sai da posição da prova dentro do WOD. A ordem de desempate
  -- entre provas é a atual, depois o código — assim uma lista já correta
  -- não é embaralhada, e duas provas com a mesma ordem caem num critério
  -- estável em vez de ficarem à sorte.
  -- `on commit drop` só larga a tabela no COMMIT. Simular e aplicar na
  -- mesma transação — o que a tela faz — colidiria na segunda chamada.
  drop table if exists athx_plano;

  create temporary table athx_plano on commit drop as
  select
    p.id,
    p.wod_id,
    w.numero as wod_numero,
    p.codigo as codigo_atual,
    p.ordem  as ordem_atual,
    w.numero || chr(64 + row_number() over (
      partition by p.wod_id order by p.ordem, p.codigo
    )::integer) as codigo_novo,
    row_number() over (partition by p.wod_id order by p.ordem, p.codigo)::integer as ordem_nova
  from public.provas p
  join public.wods w on w.id = p.wod_id
  where w.event_id = p_event;

  -- Mais de 26 provas num WOD acabaria a letra. Não acontece num evento
  -- real, mas sair com um código inválido seria pior do que recusar.
  if exists (select 1 from athx_plano where ordem_nova > 26) then
    raise exception 'Um dos WODs tem mais de 26 provas. Padronize os códigos à mão.'
      using errcode = 'check_violation';
  end if;

  select exists (
    select 1 from athx_plano
    where codigo_novo <> codigo_atual or ordem_nova <> ordem_atual
  ) into v_mudou;

  if p_aplicar and v_mudou then
    -- O gatilho que valida os componentes sai do caminho durante a troca:
    -- entre renomear a prova e remapear quem a soma existe um instante em
    -- que o componente aponta para um código que já não existe. O DDL é
    -- transacional, então um erro no meio desfaz tudo, inclusive isto.
    alter table public.provas disable trigger provas_componentes;

    -- Duas fases, porque renomear direto colide: trocar 2A por 3A falharia
    -- se 3A já existisse no mesmo WOD, mesmo que ele também vá ser trocado.
    update public.provas p
    set codigo = '#' || p.id::text
    from athx_plano x
    where x.id = p.id;

    update public.provas p
    set codigo = x.codigo_novo,
        ordem  = x.ordem_nova
    from athx_plano x
    where x.id = p.id;

    -- Quem SOMA outras provas passa a citar os códigos novos.
    update public.provas p
    set componentes = (
      select coalesce(array_agg(coalesce(x.codigo_novo, c.valor) order by c.i), '{}')
      from unnest(p.componentes) with ordinality as c(valor, i)
      left join athx_plano x on x.wod_id = p.wod_id and x.codigo_atual = c.valor
    )
    where p.origem = 'SOMA'
      and p.wod_id in (select distinct wod_id from athx_plano);

    alter table public.provas enable trigger provas_componentes;
  end if;

  return query
    select x.wod_numero, x.codigo_atual, x.codigo_novo, x.ordem_atual, x.ordem_nova
    from athx_plano x
    where x.codigo_novo <> x.codigo_atual or x.ordem_nova <> x.ordem_atual
    order by x.wod_numero, x.ordem_nova;
end;
$$;

comment on function public.athx_padronizar_codigos is
  'Põe os códigos das provas no padrão <número do WOD><letra> e a ordem em 1..n. Com p_aplicar = false, só devolve o plano. Não toca em resultado: lançamento aponta para o id da prova, não para o código.';

grant execute on function public.athx_padronizar_codigos(uuid, boolean) to authenticated;
