-- Segurança (Supabase advisor 0011): fixa o search_path da função que protege as tabelas somente-inclusão.
ALTER FUNCTION "forbid_mutation"() SET search_path = '';
