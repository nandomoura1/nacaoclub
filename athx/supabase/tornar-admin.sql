-- ============================================================================
--
--   NAÇÃO ATHX — LIBERAR ACESSO DE ADMINISTRADOR
--
-- ----------------------------------------------------------------------------
--
--   ANTES de rodar este arquivo, crie a pessoa como usuário:
--
--     Supabase -> Authentication -> Users -> Add user
--     - informe e-mail e senha
--     - MARQUE a opção "Auto Confirm User"
--
--   Depois é só trocar o e-mail abaixo e rodar no SQL Editor.
--
--   Ter conta no Supabase NÃO basta para lançar resultados: só quem está na
--   tabela admin_users consegue escrever. É isso que as regras de segurança
--   (RLS) verificam em toda gravação.
--
--   Repita para cada pessoa da organização que vai lançar resultados.
--
-- ============================================================================

do $$
declare
  -- ↓↓↓ TROQUE AQUI PELO E-MAIL DA PESSOA ↓↓↓
  v_email text := 'voce@nacaoclub.com.br';
  v_nome  text := 'Nome da Pessoa';
  -- ↑↑↑ ------------------------------- ↑↑↑

  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(btrim(v_email));

  if v_user_id is null then
    raise exception
      'Nenhum usuário com o e-mail "%". Crie primeiro em Authentication > Users (marcando Auto Confirm User) e rode este arquivo de novo.',
      v_email;
  end if;

  insert into public.admin_users (user_id, email, name)
  values (v_user_id, lower(btrim(v_email)), v_nome)
  on conflict (user_id) do update
    set email = excluded.email,
        name  = excluded.name;

  raise notice '';
  raise notice '========================================================';
  raise notice '  Acesso liberado para %', v_email;
  raise notice '  Agora essa pessoa pode entrar em /login e lançar';
  raise notice '  resultados.';
  raise notice '========================================================';
  raise notice '';
end $$;

-- Quem já tem acesso hoje:
select email, name, created_at from public.admin_users order by created_at;
