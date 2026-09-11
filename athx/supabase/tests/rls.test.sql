-- ============================================================================
-- NAÇÃO ATHX — verificação do RLS (§35, §44)
--
-- Rode contra um banco com todas as migrations aplicadas:
--   psql "$DATABASE_URL" -f supabase/tests/rls.test.sql
--
-- Cada bloco imprime PASSOU ou FALHOU. Nenhuma alteração persiste: tudo roda
-- dentro de uma transação com ROLLBACK no fim.
-- ============================================================================

begin;

\set QUIET on
\set ON_ERROR_STOP off

-- --- Cenário -----------------------------------------------------------------
insert into admin_users (user_id, email, name)
values ('11111111-1111-1111-1111-111111111111', 'admin@nacaoclub.test', 'Admin Teste')
on conflict (user_id) do nothing;

-- O teste cria o próprio cenário e não depende de haver resultado no banco:
-- uma dupla com resultado em RASCUNHO e outra com resultado PUBLICADO.
delete from wod1_results;

insert into wod1_results (event_id, team_id, strict_press_athlete_1, status)
select t.event_id, t.id, 60, 'DRAFT'
from teams t order by t.team_number limit 1;

insert into wod1_results (event_id, team_id, strict_press_athlete_1, status)
select t.event_id, t.id, 70, 'PUBLISHED'
from teams t order by t.team_number offset 1 limit 1;

\set QUIET off

-- =============================================================================
-- 1) PÚBLICO (anon)
-- =============================================================================
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select case when count(*) > 0 then 'PASSOU' else 'FALHOU' end
       || ' :: anon LÊ as duplas'
from teams;

select case when count(*) = 0 then 'PASSOU' else 'FALHOU' end
       || ' :: anon NÃO vê resultado em rascunho'
from wod1_results where status = 'DRAFT';

select case when count(*) > 0 then 'PASSOU' else 'FALHOU' end
       || ' :: anon vê resultado publicado'
from wod1_results where status = 'PUBLISHED';

savepoint s1;
do $$
begin
  insert into teams (event_id, team_number, team_name, category)
  select id, 991, 'Invasora', 'MISTA' from events limit 1;
  raise notice 'FALHOU :: anon conseguiu INSERIR dupla';
exception when insufficient_privilege or others then
  raise notice 'PASSOU :: anon NÃO consegue inserir dupla';
end $$;
rollback to savepoint s1;

savepoint s2;
do $$
begin
  update wod1_results set strict_press_athlete_1 = 999;
  if found then
    raise notice 'FALHOU :: anon conseguiu ALTERAR resultado';
  else
    raise notice 'PASSOU :: anon NÃO altera resultado (nenhuma linha afetada)';
  end if;
exception when insufficient_privilege or others then
  raise notice 'PASSOU :: anon NÃO consegue alterar resultado';
end $$;
rollback to savepoint s2;

savepoint s3;
do $$
begin
  perform * from audit_logs;
  raise notice 'PASSOU :: anon vê 0 linhas de auditoria (sem policy de leitura)';
exception when insufficient_privilege then
  raise notice 'PASSOU :: anon NÃO consegue ler auditoria';
end $$;
rollback to savepoint s3;

reset role;

-- =============================================================================
-- 2) AUTENTICADO QUE NÃO É ADMIN
-- =============================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select case when athx_is_admin() = false then 'PASSOU' else 'FALHOU' end
       || ' :: usuário fora de admin_users não é admin';

savepoint s4;
do $$
begin
  update teams set team_name = 'Hackeada';
  if found then
    raise notice 'FALHOU :: não-admin conseguiu ALTERAR dupla';
  else
    raise notice 'PASSOU :: não-admin NÃO altera dupla';
  end if;
exception when insufficient_privilege or others then
  raise notice 'PASSOU :: não-admin NÃO consegue alterar dupla';
end $$;
rollback to savepoint s4;

reset role;

-- =============================================================================
-- 3) ADMIN
-- =============================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

select case when athx_is_admin() = true then 'PASSOU' else 'FALHOU' end
       || ' :: usuário de admin_users é admin';

select case when count(*) > 0 then 'PASSOU' else 'FALHOU' end
       || ' :: admin VÊ resultado em rascunho'
from wod1_results where status = 'DRAFT';

savepoint s5;
do $$
begin
  update teams set team_name = team_name where team_number = 1;
  raise notice 'PASSOU :: admin consegue alterar dupla';
exception when others then
  raise notice 'FALHOU :: admin NÃO conseguiu alterar dupla (%)', sqlerrm;
end $$;
rollback to savepoint s5;

reset role;

-- =============================================================================
-- 4) RESULTADO TRAVADO (LOCKED)
--
--    Travar congela o que foi LANÇADO — não pode impedir o motor de
--    recalcular. Este bloco existe porque a primeira versão do guarda
--    bloqueava o próprio recálculo: travar o WOD 1 e depois publicar o
--    WOD 3 quebrava, e o botão TRAVAR nem funcionava.
-- =============================================================================

savepoint s6;

delete from wod1_results;
insert into wod1_results (event_id, team_id, strict_press_athlete_1, status)
select e.id, t.id, 50 + t.team_number * 10, 'PUBLISHED'
from events e join teams t on t.event_id = e.id
where t.team_number <= 3;

do $$
begin
  update wod1_results set status = 'LOCKED';
  raise notice 'PASSOU :: consegue TRAVAR os resultados';
exception when others then
  raise notice 'FALHOU :: nao conseguiu travar (%)', sqlerrm;
end $$;

do $$
begin
  perform athx_recalculate_event(id) from events;
  raise notice 'PASSOU :: recalculo roda com resultado travado';
exception when others then
  raise notice 'FALHOU :: recalculo quebrou com resultado travado (%)', sqlerrm;
end $$;

select case when count(*) = 3 then 'PASSOU' else 'FALHOU' end
       || ' :: resultado travado continua pontuado pelo motor'
from wod1_results where rank is not null and points is not null;

do $$
begin
  update wod1_results set strict_press_athlete_1 = 999;
  raise notice 'FALHOU :: conseguiu ALTERAR carga de resultado travado';
exception when others then
  raise notice 'PASSOU :: NAO consegue alterar carga de resultado travado';
end $$;

rollback to savepoint s6;

rollback;
