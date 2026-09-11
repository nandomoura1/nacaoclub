-- ============================================================================
-- NAÇÃO ATHX · SEED (§36)
--
-- Cria o evento e as 20 duplas numeradas.
--
-- NOMES DOS ATLETAS FICAM VAZIOS de propósito — a organização preenche em
-- /admin/teams. Nenhum nome real é inventado aqui.
--
-- CATEGORIA: o enum exige um valor, então todas entram como MISTA.
-- >>> A organização DEVE revisar a categoria de cada dupla em /admin/teams
--     antes do evento. Não há como adivinhar isso. <<<
--
-- BATERIA: duplas 1–10 na bateria 1, 11–20 na bateria 2 (§37 prevê duas
-- baterias por WOD). Ajustável no admin.
--
-- Idempotente: pode rodar quantas vezes quiser.
-- ============================================================================

insert into public.events (slug, name, date, status)
values (
  'nacao-celebration-setembro-amarelo',
  'Nação Celebration — Nação ATHX',
  date '2026-09-12',
  'LIVE'
)
on conflict (slug) do update
  set name = excluded.name,
      date = excluded.date;

insert into public.event_settings (event_id)
select id from public.events where slug = 'nacao-celebration-setembro-amarelo'
on conflict (event_id) do nothing;

insert into public.teams (event_id, team_number, team_name, category, athlete_1, athlete_2, battery, status)
select
  e.id,
  n,
  'Dupla ' || lpad(n::text, 2, '0'),
  'MISTA'::athx_category,
  '',
  '',
  case when n <= 10 then 1 else 2 end,
  'INSCRITA'::athx_team_status
from public.events e
cross join generate_series(1, 20) as n
where e.slug = 'nacao-celebration-setembro-amarelo'
on conflict (event_id, team_number) do nothing;
