/**
 * Gera supabase/setup-completo.sql — a junção de todas as migrations e do
 * seed em um arquivo só, para instalar o banco com UMA colagem no SQL Editor
 * do Supabase.
 *
 * Rode depois de criar ou alterar qualquer migration:
 *   node scripts/gerar-setup.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const DIR = 'supabase/migrations';
const partes = [
  ...readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort().map((f) => join(DIR, f)),
  'supabase/seed.sql',
];

const cabecalho = `-- ============================================================================
--
--   NAÇÃO ATHX — INSTALAÇÃO COMPLETA DO BANCO
--   Nação Celebration · Etapa Setembro Amarelo · 12 de setembro
--
-- ----------------------------------------------------------------------------
--
--   COMO USAR (leva 1 minuto):
--
--   1. abra o painel do seu projeto no Supabase
--   2. menu da esquerda -> SQL Editor
--   3. clique em "New query"
--   4. cole TODO o conteúdo deste arquivo
--   5. clique em RUN (ou Ctrl+Enter)
--
--   Pronto. Cria as tabelas, o motor de classificação, a segurança, o
--   tempo real, a auditoria, o evento e as 20 duplas.
--
--   Pode rodar mais de uma vez sem medo: é idempotente, não duplica nada
--   e não apaga resultado já lançado.
--
--   DEPOIS DISSO falta só liberar o seu acesso de administrador —
--   use o arquivo supabase/tornar-admin.sql.
--
-- ----------------------------------------------------------------------------
--
--   ESTE ARQUIVO É GERADO. Não edite aqui.
--   Ele é a junção, na ordem, de:
--
${partes.map((p) => `--     ${p}`).join('\n')}
--
--   Para regenerar:  node scripts/gerar-setup.mjs
--
-- ============================================================================

`;

const corpo = partes
  .map(
    (p) => `
-- ============================================================================
-- >>> ${basename(p)}
-- ============================================================================

${readFileSync(p, 'utf8').trimEnd()}
`,
  )
  .join('\n');

const rodape = `

-- ============================================================================
-- FIM. Confirmação rápida do que foi criado.
-- ============================================================================

do $$
declare
  v_duplas integer;
  v_evento text;
begin
  select count(*) into v_duplas from public.teams;
  select name into v_evento from public.events limit 1;

  raise notice '';
  raise notice '========================================================';
  raise notice '  NAÇÃO ATHX — banco instalado com sucesso';
  raise notice '  Evento: %', coalesce(v_evento, '(nenhum)');
  raise notice '  Duplas cadastradas: %', v_duplas;
  raise notice '';
  raise notice '  PRÓXIMO PASSO:';
  raise notice '  1) crie seu usuario em Authentication > Users';
  raise notice '  2) rode o arquivo supabase/tornar-admin.sql';
  raise notice '========================================================';
  raise notice '';
end $$;
`;

writeFileSync('supabase/setup-completo.sql', cabecalho + corpo + rodape);
console.log('supabase/setup-completo.sql gerado a partir de', partes.length, 'arquivos');
