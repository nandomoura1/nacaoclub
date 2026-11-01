-- ============================================================================
-- NAÇÃO HÍBRIDA · FALTA RODAR
--
-- Parte da migration 0016 já foi aplicada. Este arquivo é o PEDAÇO QUE FALTA:
-- a tabela de colaboradores, a nova regra de quem é admin e a lista da equipe.
--
-- COMO RODAR
--   1. Supabase -> projeto nacao-athx -> SQL Editor -> New query
--   2. Cole ESTE arquivo inteiro
--   3. Run  ->  deve aparecer "Success. No rows returned"
--
-- Seguro rodar mais de uma vez. Nada é apagado.
-- ============================================================================

create table if not exists public.admin_emails (
  email      text primary key check (email = lower(btrim(email)) and position('@' in email) > 1),
  nome       text,
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table public.admin_emails is
  'E-mails autorizados a administrar. A pessoa ganha acesso ao criar a conta, sem passo manual no painel.';

-- Quem é admin: quem está em admin_users OU com e-mail autorizado.
-- Chamada em toda checagem de RLS, então as duas consultas são por chave.
create or replace function public.athx_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
      select 1 from public.admin_users a where a.user_id = auth.uid()
    )
    or exists (
      select 1
      from auth.users u
      join public.admin_emails e on e.email = lower(u.email)
      where u.id = auth.uid()
    );
$fn$;

-- O `where athx_is_admin()` nas duas pernas não é redundância: esta view roda
-- como DONA (precisa, para ler auth.users), então o RLS das tabelas de baixo
-- não se aplica. Sem o filtro, qualquer pessoa logada leria a lista de
-- e-mails de quem administra.
create or replace view public.athx_equipe as
select
  e.email,
  e.nome,
  'AUTORIZADO'::text as origem,
  exists (select 1 from auth.users u where lower(u.email) = e.email) as tem_login,
  e.created_at
from public.admin_emails e
where public.athx_is_admin()
union all
select
  a.email,
  a.name as nome,
  'CADASTRADO'::text as origem,
  true as tem_login,
  a.created_at
from public.admin_users a
where public.athx_is_admin()
  and not exists (select 1 from public.admin_emails e where e.email = lower(a.email));

grant select, insert, update, delete on public.admin_emails to authenticated;
grant select on public.athx_equipe to authenticated;

alter table public.admin_emails enable row level security;

drop policy if exists admin_emails_admin_all on public.admin_emails;
create policy admin_emails_admin_all on public.admin_emails
  for all to authenticated
  using (public.athx_is_admin())
  with check (public.athx_is_admin());

-- admin_users tinha RLS ligado e nenhuma política — ou seja, ninguém lia.
-- A tela de colaboradores precisa ler para mostrar quem já tinha acesso.
grant select on public.admin_users to authenticated;

drop policy if exists admin_users_admin_read on public.admin_users;
create policy admin_users_admin_read on public.admin_users
  for select to authenticated
  using (public.athx_is_admin());

alter view public.athx_equipe set (security_invoker = off);
