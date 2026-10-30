# 09 · Segurança e proteção de dados — auditoria de 30/10/2026

Escopo: aplicação Nação ADM (Next.js na Vercel) e banco/arquivos no Supabase
(projeto `frhrxdasgfnzdrthjeoi`, schema `horas`, bucket `marketing`).

## Resumo

| Área | Situação |
|---|---|
| Acesso ao banco pela API pública do Supabase (`anon`/`authenticated`) | ✅ Sem acesso ao schema `horas` (0 permissões) |
| Usuário do banco da aplicação (`nacao_app`) | ✅ Sem superuser e sem bypass de RLS |
| Arquivos (criativos, documentos, imagens do Kanban) | ✅ Bucket **privado**; leitura só por URL assinada de 1 h, gerada após checar permissão |
| Senhas | ✅ scrypt com sal; mesma resposta e mesmo tempo para e-mail inexistente e senha errada |
| Sessão | ✅ Cookie `httpOnly`, `secure`, `sameSite=lax`; banco guarda só o HMAC do token; expira em 12 h; revogável |
| Permissões | ✅ Papéis e permissões por função; checagem no servidor em cada caso de uso; escopo por área (coordenador) e setor (líder) |
| Dado pessoal de colaboradores (telefone, e-mail, observações) | ✅ Só sai do servidor para quem tem `teacher.view_personal` |
| Auditoria | ✅ Histórico append-only (trigger bloqueia alteração/exclusão), com IP e navegador |
| Rotas sem login (webhooks, cron, TV, primeiro acesso) | ✅ Protegidas por token/segredo próprio; primeiro acesso exige `SETUP_TOKEN` |
| Segredos no código/histórico do git | ✅ Nenhum encontrado (só `.env.example`) |
| Cabeçalhos de segurança | ✅ X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy · ✅ HSTS (novo) |
| Tentativa e erro de senha | ✅ **Corrigido**: bloqueio após 5 erros por e-mail (ou 20 por IP) em 15 min |
| Bibliotecas com vulnerabilidade | ✅ **Corrigido**: Next.js 15.5.28 (falha **crítica** de execução remota no otimizador de imagens), sharp, postcss · ⚠️ restam zod e Prisma (ver pendências) |
| Aviso do Supabase (função sem `search_path` fixo) | ✅ **Corrigido** |

## Correções aplicadas nesta auditoria

1. **Next.js atualizado para 15.5.28** e dependências (sharp, postcss — inclusive a cópia interna
   do Next, via `overrides`). Fecha uma falha crítica de execução remota de código e falhas
   altas de negação de serviço e leitura de arquivos.
2. **Limite de tentativas de login**: 5 senhas erradas para o mesmo e-mail (ou 20 do mesmo IP)
   em 15 minutos bloqueiam novas tentativas por 15 minutos. Tudo fica no histórico.
3. **HSTS**: o navegador passa a exigir HTTPS no domínio por 2 anos.
4. **Banco**: `horas.forbid_mutation` com `search_path` fixo (alerta 0011 do Supabase).

## Dados sensíveis que o sistema guarda

- **Colaboradores**: nome, e-mail, telefone, datas de admissão/desligamento, observações,
  documentos da equipe (arquivos privados, permissão `teacher.docs`).
- **Marketing**: leads (nome, telefone, e-mail de interessados) — permissão `mkt.view`;
  exclusão só `mkt.admin`.
- **Financeiro/Condomínio**: dados da **empresa** (CNPJ, conta e PIX de recebimento).
- **Não** guarda CPF, salário ou conta bancária de pessoas.

## Pendências recomendadas (por prioridade)

1. **Supabase — backups**: confirmar no painel se o plano tem backup diário e, de preferência,
   *Point-in-Time Recovery*. Testar uma restauração ao menos uma vez.
2. **Atualizar zod (3 → 4)** — falha "alta" de consumo de memória com listas enormes; o risco é
   baixo aqui (corpo das requisições limitado a 6 MB e listas com limite), mas é atualização
   de versão grande: fazer com calma, com a suíte de testes.
3. **Atualizar Prisma (6 → 7)** — a falha está numa dependência da ferramenta de linha de
   comando (`deepmerge-ts`), não no acesso ao banco em produção. Atualização grande.
4. **LGPD — leads**: definir prazo de guarda (ex.: apagar ou anonimizar leads perdidos após
   12 meses) e registrar a base legal no formulário de captação.
5. **Usuários**: revisar a cada trimestre quem tem papel Administrador/Consulta e desativar
   quem saiu (Administração → Usuários).
6. **Content-Security-Policy**: cabeçalho que restringe de onde a página carrega scripts.
   Exige testar todas as telas; fazer numa rodada própria.

## Como repetir esta auditoria

- `npm audit --omit=dev` (na pasta `horas/`) — zero "critical"/"high" que tenham correção sem quebra.
- Supabase → Advisors → Security (ou ferramenta `get_advisors`).
- Conferir que `anon`/`authenticated` seguem sem acesso ao schema `horas` e que o bucket segue privado.
- Rodar `npx vitest run` (os testes cobrem permissões, dado pessoal, bloqueio de login e arquivos).
