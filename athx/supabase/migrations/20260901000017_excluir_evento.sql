-- ============================================================================
-- NAÇÃO HÍBRIDA · 0017 · EXCLUIR UM EVENTO
--
-- Arquivar resolve o caso normal: a etapa acabou e sai do ar sem perder
-- nada. Mas um evento criado por engano — nome errado, data errada, clone
-- duplicado — não tem por que ser arquivado. Ele tem de sumir.
--
-- O QUE A FUNÇÃO RECUSA, E POR QUÊ
--
--   evento NO AR          é o que o público está vendo agora. Apagar o que
--                         está no ar é quase sempre engano; se for mesmo a
--                         intenção, basta colocar outro no ar antes.
--
--   evento COM RESULTADO  lançamento homologado é o registro da competição.
--                         Uma dupla levantou aquela carga, e isso não se
--                         desfaz por um clique numa tela de administração.
--
-- O que ela ACEITA apagar: a definição (WODs, provas, prescrição, agenda,
-- configurações) e as duplas inscritas. Inscrição é trabalho, não registro
-- histórico — e a tela avisa quantas vão junto antes de confirmar.
-- ============================================================================

create or replace function public.athx_excluir_evento(p_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome        text;
  v_status      athx_event_status;
  v_lancamentos integer;
  v_antigos     integer;
begin
  if not public.athx_is_admin() then
    raise exception 'Apenas a organização pode excluir um evento.'
      using errcode = 'insufficient_privilege';
  end if;

  select name, status into v_nome, v_status from public.events where id = p_event;

  if v_nome is null then
    raise exception 'Esse evento já não existe.' using errcode = 'no_data_found';
  end if;

  if v_status = 'LIVE' then
    raise exception 'O evento "%" está no ar. Coloque outro no ar antes de excluir este.', v_nome
      using errcode = 'check_violation';
  end if;

  -- Qualquer rastro de competição trava a exclusão: homologação, valor
  -- lançado, ou resultado no modelo antigo (que ainda guarda setembro).
  select
    (select count(*) from public.wod_entries   where event_id = p_event)
  + (select count(*) from public.prova_results where event_id = p_event)
  into v_lancamentos;

  select
    (select count(*) from public.wod1_results where event_id = p_event)
  + (select count(*) from public.wod2_results where event_id = p_event)
  + (select count(*) from public.wod3_results where event_id = p_event)
  into v_antigos;

  if v_lancamentos + v_antigos > 0 then
    raise exception
      'O evento "%" tem % resultado(s) lançado(s) e não pode ser excluído. Resultado de competição não se apaga — use Arquivar, que tira do ar e guarda tudo.',
      v_nome, v_lancamentos + v_antigos
      using errcode = 'check_violation';
  end if;

  -- ------------------------------------------------------------------
  -- A ORDEM IMPORTA.
  --
  -- Apagar o evento direto deixaria o Postgres apagar as duplas em
  -- cascata — e o gatilho de auditoria dispararia tentando gravar uma
  -- linha que aponta para o evento que está sumindo no mesmo comando. A
  -- chave estrangeira recusa, e a exclusão falha com um erro que não diz
  -- nada a quem está na tela.
  --
  -- Apagando as duplas primeiro, o gatilho grava enquanto o evento ainda
  -- existe. Depois o evento sai, e a auditoria fica com event_id nulo
  -- (a coluna é ON DELETE SET NULL): o histórico de quem fez o quê
  -- sobrevive à exclusão, que é como tem de ser.
  -- ------------------------------------------------------------------
  delete from public.teams where event_id = p_event;

  -- O resto é cascata: wods -> blocos e provas, agenda, event_settings.
  delete from public.events where id = p_event;

  raise notice 'NACAO HIBRIDA: evento "%" excluido', v_nome;
end;
$$;

comment on function public.athx_excluir_evento is
  'Exclui um evento sem resultado lançado. Recusa o que está no ar e o que tem registro de competição — para esses, Arquivar.';

grant execute on function public.athx_excluir_evento(uuid) to authenticated;
