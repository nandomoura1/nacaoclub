-- ============================================================================
--
--   NAÇÃO ATHX — LIMPAR RESULTADOS DE TESTE
--
-- ----------------------------------------------------------------------------
--
--   Use DEPOIS do ensaio, para deixar o sistema zerado para o evento real.
--
--   APAGA:
--     · todos os resultados dos WODs 1, 2 e 3
--     · o resumo de pontuação
--     · o histórico de auditoria
--
--   MANTÉM (não encosta):
--     · as 20 duplas, com nomes, categorias e baterias
--     · o evento e as configurações (/admin/settings)
--     · os acessos de administrador — ninguém perde o login
--
--   Ou seja: você ensaia à vontade e volta ao ponto de partida sem refazer
--   cadastro nenhum.
--
--   COMO USAR:
--     Supabase -> SQL Editor -> New query -> colar tudo -> RUN
--
-- ============================================================================

do $$
declare
  v_w1 integer;
  v_w2 integer;
  v_w3 integer;
  v_audit integer;
  v_duplas integer;
begin
  select count(*) into v_w1 from public.wod1_results;
  select count(*) into v_w2 from public.wod2_results;
  select count(*) into v_w3 from public.wod3_results;
  select count(*) into v_audit from public.audit_logs;

  -- Resultados. O resumo wod_results cai junto por cascata do próprio
  -- delete abaixo, mas limpamos explicitamente para não depender disso.
  delete from public.wod1_results;
  delete from public.wod2_results;
  delete from public.wod3_results;
  delete from public.wod_results;

  -- Histórico do ensaio não deve poluir a auditoria do evento real.
  delete from public.audit_logs;

  select count(*) into v_duplas from public.teams;

  raise notice '';
  raise notice '========================================================';
  raise notice '  RESULTADOS LIMPOS';
  raise notice '';
  raise notice '  WOD 1 ............ % resultados apagados', v_w1;
  raise notice '  WOD 2 ............ % resultados apagados', v_w2;
  raise notice '  WOD 3 ............ % resultados apagados', v_w3;
  raise notice '  Auditoria ........ % registros apagados', v_audit;
  raise notice '';
  raise notice '  MANTIDO:';
  raise notice '  Duplas ........... % (nomes e categorias intactos)', v_duplas;
  raise notice '  Configurações .... intactas';
  raise notice '  Administradores .. intactos';
  raise notice '';
  raise notice '  O leaderboard voltou para "aguardando resultados".';
  raise notice '========================================================';
  raise notice '';
end $$;

-- Conferência: tem que voltar tudo zerado, com as duplas preservadas.
select
  (select count(*) from public.teams)         as duplas_mantidas,
  (select count(*) from public.wod1_results)  as resultados_wod1,
  (select count(*) from public.wod2_results)  as resultados_wod2,
  (select count(*) from public.wod3_results)  as resultados_wod3,
  (select count(*) from public.admin_users)   as admins_mantidos;
