-- ============================================================================
-- NAÇÃO ATHX — verificação de permissões do modelo genérico
--
-- Roda dentro de uma transação e desfaz tudo no fim. Cada bloco imprime
-- PASSOU ou levanta exceção.
-- ============================================================================
\set ON_ERROR_STOP on
begin;

-- Um admin de mentira para os testes.
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'juiz@teste')
on conflict do nothing;
insert into public.admin_users (user_id, email)
values ('11111111-1111-1111-1111-111111111111', 'juiz@teste')
on conflict do nothing;

create or replace function pg_temp.virar(p_user uuid) returns void language plpgsql as $$
begin
  if p_user is null then
    execute 'create or replace function auth.uid() returns uuid language sql stable as $f$ select null::uuid $f$';
  else
    execute format('create or replace function auth.uid() returns uuid language sql stable as $f$ select %L::uuid $f$', p_user);
  end if;
end $$;

-- ---------------------------------------------------------------------------
do $$
declare v int;
begin
  perform pg_temp.virar(null);
  set local role anon;
  select count(*) into v from public.wods;
  reset role;
  if v = 0 then raise exception 'FALHOU :: público não consegue ler a prescrição dos WODs'; end if;
  raise notice 'PASSOU :: público lê a prescrição dos WODs';
end $$;

do $$
declare v int;
begin
  set local role anon;
  select count(*) into v from public.provas;
  reset role;
  if v = 0 then raise exception 'FALHOU :: público não consegue ler as provas'; end if;
  raise notice 'PASSOU :: público lê as provas';
end $$;

-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    insert into public.wods (event_id, numero, nome)
    select id, 99, 'INVASAO' from public.events limit 1;
    reset role;
    raise exception 'FALHOU :: público conseguiu criar um WOD';
  exception when insufficient_privilege or others then
    reset role;
    raise notice 'PASSOU :: público NÃO cria WOD';
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    update public.prova_results set valor = 999;
    reset role;
    raise exception 'FALHOU :: público conseguiu alterar lançamento';
  exception when insufficient_privilege or others then
    reset role;
    raise notice 'PASSOU :: público NÃO altera lançamento';
  end;
end $$;

-- ---------------------------------------------------------------------------
do $$
declare v_wod uuid; v_team uuid; v int;
begin
  select id into v_wod from public.wods order by numero limit 1;
  select team_id into v_team from public.wod_entries where wod_id = v_wod limit 1;

  update public.wod_entries set status = 'DRAFT' where wod_id = v_wod and team_id = v_team;

  perform pg_temp.virar(null);
  set local role anon;
  select count(*) into v from public.wod_entries where wod_id = v_wod and team_id = v_team;
  reset role;
  if v <> 0 then raise exception 'FALHOU :: público viu lançamento em rascunho'; end if;
  raise notice 'PASSOU :: público NÃO vê rascunho';

  perform pg_temp.virar('11111111-1111-1111-1111-111111111111');
  set local role authenticated;
  select count(*) into v from public.wod_entries where wod_id = v_wod and team_id = v_team;
  reset role;
  if v = 0 then raise exception 'FALHOU :: admin não viu o rascunho'; end if;
  raise notice 'PASSOU :: admin VÊ rascunho';
end $$;

-- ---------------------------------------------------------------------------
do $$
declare v_wod uuid; v_team uuid;
begin
  select id into v_wod from public.wods order by numero limit 1;
  select team_id into v_team from public.wod_entries where wod_id = v_wod limit 1;

  update public.wod_entries set status = 'LOCKED' where wod_id = v_wod and team_id = v_team;
  raise notice 'PASSOU :: consegue TRAVAR o resultado';

  begin
    update public.prova_results r set valor_atleta_1 = 999
    from public.provas p
    where p.id = r.prova_id and p.wod_id = v_wod and r.team_id = v_team;
    raise exception 'FALHOU :: alterou lançamento travado';
  exception when check_violation then
    raise notice 'PASSOU :: NÃO altera lançamento travado';
  end;

  -- A classificação continua pontuando o resultado travado.
  if not exists (
    select 1 from public.athx_prova_scores s
    join public.provas p on p.id = s.prova_id
    where p.wod_id = v_wod and s.team_id = v_team and s.points is not null
  ) then
    raise exception 'FALHOU :: resultado travado deixou de pontuar';
  end if;
  raise notice 'PASSOU :: resultado travado continua pontuado';
end $$;

-- ---------------------------------------------------------------------------
do $$
declare v_wod uuid;
begin
  select id into v_wod from public.wods order by numero limit 1;
  begin
    insert into public.provas (wod_id, codigo, descricao, unidade, direcao, origem, componentes)
    values (v_wod, 'XX', 'Soma de uma soma', 'KG', 'MAIOR_VENCE', 'SOMA', array['1D']);
    raise exception 'FALHOU :: aceitou soma de prova calculada';
  exception when check_violation then
    raise notice 'PASSOU :: recusa soma de prova calculada';
  end;

  begin
    insert into public.provas (wod_id, codigo, descricao, unidade, direcao, origem, componentes)
    values (v_wod, 'YY', 'Soma de prova inexistente', 'KG', 'MAIOR_VENCE', 'SOMA', array['ZZ']);
    raise exception 'FALHOU :: aceitou componente inexistente';
  exception when check_violation then
    raise notice 'PASSOU :: recusa componente inexistente';
  end;
end $$;

-- ---------------------------------------------------------------------------
do $$
declare v int;
begin
  select count(*) into v from public.audit_logs where entity_type in ('wod_entries', 'prova_results');
  if v = 0 then raise exception 'FALHOU :: alterações não entraram na auditoria'; end if;
  raise notice 'PASSOU :: alterações ficam na auditoria';
end $$;

rollback;
