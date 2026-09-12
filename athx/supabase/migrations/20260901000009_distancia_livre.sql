-- ============================================================================
-- NAÇÃO ATHX · 0009 · WOD 2 aceita qualquer distância
--
-- A troca entre os atletas da corrida acontece a cada 500 m — isso é regra de
-- pista, dita no briefing e cobrada pelo juiz.
--
-- Mas a DISTÂNCIA REGISTRADA é outra coisa: o AMRAP para no minuto 22, no
-- meio de um trecho. Uma dupla pode terminar com 2.410 m de corrida e 2.590 m
-- de bike. Exigir múltiplo de 500 no lançamento tornava impossível registrar
-- o resultado real.
--
-- ----------------------------------------------------------------------------
-- RODA EM BANCO JÁ INSTALADO. Não apaga nada: só remove a trava e recoloca
-- a única regra que continua valendo — distância não pode ser negativa.
-- ============================================================================

alter table public.wod2_results
  drop constraint if exists wod2_results_run_km_check;

alter table public.wod2_results
  add constraint wod2_results_run_km_check
  check (run_km is null or run_km >= 0);

comment on column public.wod2_results.run_km is
  'Distância de corrida em km. Valor livre: o AMRAP para no meio de um trecho.';
