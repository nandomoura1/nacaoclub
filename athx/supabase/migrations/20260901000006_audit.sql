-- ============================================================================
-- NAÇÃO ATHX · 0006 · Auditoria (§23)
--
-- Toda alteração de resultado e de dupla fica registrada com valor anterior,
-- valor novo, autor e horário. Exemplo do que a tela de auditoria mostra:
--
--   "Admin alterou WOD 2 da Dupla 07: Bike 8.45 → 8.75 km"
-- ============================================================================

create or replace function public.athx_audit_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wod    smallint := substring(tg_table_name from 'wod(\d)_results')::smallint;
  v_email  text;
  v_action text := tg_op;
  v_team   uuid := case when tg_op = 'DELETE' then old.team_id else new.team_id end;
  v_event  uuid := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  -- Colunas que o MOTOR escreve, não o juiz. Recálculo não é história.
  v_derived text[] := array[
    'rank', 'points', 'tied', 'needs_decision', 'total_points', 'total_load', 'total_km',
    'rank_run', 'points_run', 'rank_bike', 'points_bike', 'rank_total', 'points_total',
    'updated_at', 'updated_by'
  ];
begin
  -- Um recálculo reescreve posição e pontos de todas as duplas. Se NADA além
  -- desses campos mudou, não houve ação humana e não há o que auditar.
  -- Sem este filtro, um evento de 20 duplas geraria milhares de linhas de
  -- ruído e a auditoria deixaria de responder "quem mudou o quê".
  if tg_op = 'UPDATE'
     and (to_jsonb(old) - v_derived) = (to_jsonb(new) - v_derived) then
    return null;
  end if;

  select email into v_email from admin_users where user_id = auth.uid();

  -- Publicação e travamento merecem ação própria no histórico.
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_action := case new.status
      when 'PUBLISHED' then 'PUBLISH'
      when 'LOCKED' then 'LOCK'
      else 'STATUS_CHANGE'
    end;
  end if;

  insert into audit_logs (
    event_id, user_id, user_email, action, entity_type, entity_id,
    team_id, wod_number, old_value, new_value
  ) values (
    v_event, auth.uid(), v_email, v_action, tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    v_team, v_wod,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['wod1_results', 'wod2_results', 'wod3_results'] loop
    execute format(
      'drop trigger if exists %1$s_audit on public.%1$s;
       create trigger %1$s_audit after insert or update or delete on public.%1$s
       for each row execute function public.athx_audit_result();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Duplas também são auditadas (cadastro, edição, desclassificação).
-- ---------------------------------------------------------------------------
create or replace function public.athx_audit_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from admin_users where user_id = auth.uid();

  insert into audit_logs (
    event_id, user_id, user_email, action, entity_type, entity_id,
    team_id, old_value, new_value
  ) values (
    case when tg_op = 'DELETE' then old.event_id else new.event_id end,
    auth.uid(), v_email, tg_op, 'teams',
    case when tg_op = 'DELETE' then old.id else new.id end,
    case when tg_op = 'DELETE' then old.id else new.id end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  return null;
end;
$$;

drop trigger if exists teams_audit on public.teams;
create trigger teams_audit after insert or update or delete on public.teams
for each row execute function public.athx_audit_team();

-- ---------------------------------------------------------------------------
-- athx_audit_feed — histórico legível para a tela /admin/results
-- ---------------------------------------------------------------------------
drop view if exists public.athx_audit_feed;
create view public.athx_audit_feed as
select
  a.id,
  a.created_at,
  a.action,
  a.entity_type,
  a.wod_number,
  coalesce(a.user_email, 'sistema') as author,
  t.team_number,
  t.team_name,
  a.old_value,
  a.new_value
from public.audit_logs a
left join public.teams t on t.id = a.team_id
order by a.created_at desc;

alter view public.athx_audit_feed set (security_invoker = on);
grant select on public.athx_audit_feed to authenticated;
