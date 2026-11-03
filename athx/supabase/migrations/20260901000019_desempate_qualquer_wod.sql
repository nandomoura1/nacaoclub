-- ============================================================================
-- NAÇÃO HÍBRIDA · 0019 · O DESEMPATE PODE APONTAR PARA QUALQUER WOD
--
-- A trava anterior listava os critérios à mão: NENHUM, WOD1, WOD2, WOD3.
-- Fazia sentido quando o evento TINHA três workouts e eles eram constantes
-- de código. Depois que a quantidade de WODs virou decisão da organização,
-- a lista ficou mentindo:
--
--   a tela de Configurações oferece um critério por WOD do evento
--   o schema em TypeScript aceita WOD<n> para qualquer n
--   o banco recusava a partir do quarto
--
-- Encontrado simulando a 4ª Celebration, que tem quatro workouts: a
-- organização não conseguia apontar o desempate para o METCON, que lá é o
-- WOD 4. O erro que aparecia citava o nome da constraint — inútil para quem
-- está montando o evento.
--
-- Agora a regra é a FORMA do critério, não uma lista de valores. Continua
-- recusando texto livre, que é o que a trava existia para impedir: o campo
-- já guardou "melhor colocação no WOD 3" escrito à mão, e nenhum motor sabe
-- ler isso.
-- ============================================================================

alter table public.event_settings
  drop constraint if exists event_settings_tie_breakers_check;

alter table public.event_settings
  add constraint event_settings_tie_breakers_check check (
    coalesce(tie_breaker_1, 'NENHUM') ~ '^(NENHUM|WOD[1-9][0-9]*)$'
    and coalesce(tie_breaker_2, 'NENHUM') ~ '^(NENHUM|WOD[1-9][0-9]*)$'
    and coalesce(tie_breaker_3, 'NENHUM') ~ '^(NENHUM|WOD[1-9][0-9]*)$'
  );

comment on constraint event_settings_tie_breakers_check on public.event_settings is
  'O critério de desempate é NENHUM ou WOD<número>, para qualquer número de workouts. Texto livre é recusado: o motor não sabe lê-lo.';
