# Nação ADM (app `horas/`) — guia do projeto

Sistema de gestão interna da Nação Club (Brasília): Gestão de Horas dos professores,
Treinos, Condomínio, Financeiro, Marketing, Escalas de Trabalho 5x2, Gestão de Processos
e Universidade Nação. Interface e textos em **português do Brasil**.

Documentação de produto e regras: `docs/01..08-*.md`, colocar no ar: `docs/colocar-no-ar.md`,
segurança: `docs/09-seguranca.md`.

## Stack

- Next.js 15 (App Router, Server Actions) + React + Tailwind · TypeScript estrito.
- Prisma + PostgreSQL. Produção: **Supabase**, projeto `frhrxdasgfnzdrthjeoi`, schema **`horas`**,
  usuário da aplicação `nacao_app` (sem superuser, sem bypass de RLS).
- Arquivos: Supabase Storage, bucket privado `marketing` (upload direto do navegador por URL
  assinada; leitura por URL assinada de 1 h). Dev/testes: `STORAGE_FAKE=1`.
- Hospedagem: Vercel (repositório de deploy `nandomoura1/nacao-horas`, branch `main`).

## Rodar e testar (local)

```bash
service postgresql start          # banco local (role nacao/nacao, bancos nacao_horas e nacao_horas_test)
npm install && npx prisma generate
npx tsc --noEmit                  # tipos
npx vitest run                    # testes (unit + integração em Postgres real) — tudo verde antes de subir
rm -rf .next && npm run build     # build de produção
STORAGE_FAKE=1 ZAPI_FAKE=1 AI_FAKE=1 PORT=3100 npm start   # login dev: admin@nacaoclub.dev
```

## Fluxo de mudança (sempre nesta ordem)

1. Código + teste no repositório `nandomoura1/nacaoclub`, pasta `horas/` (branch de trabalho).
2. `npx tsc --noEmit`, `npx vitest run` e `npm run build` limpos.
3. **Migração de banco primeiro** em produção (Supabase), depois o código:
   - criar `prisma/migrations/<AAAAMMDDHHMMSS>_<nome>/migration.sql` (SQL idempotente: `IF NOT EXISTS`);
   - em produção, aplicar o mesmo SQL **qualificado com `horas.`**; tabela nova: `ALTER TABLE horas.x OWNER TO nacao_app;`
   - registrar em `horas._prisma_migrations` com o **sha256 do migration.sql** (checksum).
4. Commit e push na branch; deploy = aplicar o patch do commit em `nacao-horas/main`
   (`git format-patch -1` → `git am -p2 --3way`) e conferir o status do commit (Vercel `success`).
5. Mudança de dados em produção: mostrar antes o que muda (consulta), preferir desativar a excluir.

Commits: mensagem em português, explicando o porquê. Sem identificador de modelo de IA no texto.

## Regras que não se quebram

- **Dados pessoais** (telefone, e-mail, observações) só saem do servidor para quem tem
  `teacher.view_personal`. Na tela de escalas vai só `hasPhone`, nunca o número.
- Nunca versionar dado real sensível (CPF, conta bancária, salário) nem segredo/token;
  segredos só nas variáveis da Vercel. Nunca usar credencial colada em conversa.
- Toda função de serviço chamada por tela/ação começa com `assertCan(principal, '<permissão>')`
  (e escopo: área do coordenador, setor do líder). Middleware é só conveniência, não autorização.
- Toda alteração relevante grava `audit()` (tabela append-only, trigger bloqueia UPDATE/DELETE).
- Não excluir dado sem confirmação; preferir `active = false`.
- Não vincular usuário a professor só pelo nome.
- IA de marketing: nada de dado pessoal no prompt; publicação sempre com aprovação humana.
- Escalas: **não criar dados fictícios para cobrir posto descoberto** — sinalizar.

## Mapa do código

- `src/domain/**` — regras puras e testáveis (sem banco). Ex.: `domain/escalas/{calendar,engine,validate,rotation,fairness}.ts`.
- `src/server/services/*-service.ts` — casos de uso (permissão, transação, auditoria).
- `src/app/(app)/<módulo>/` — telas; `actions.ts` = Server Actions finas que chamam os serviços.
- `src/server/auth/` — sessão (cookie opaco + HMAC), senha (scrypt), permissões/papéis (`permissions.ts`).
- `tests/unit`, `tests/integration` (banco real, cada arquivo cria seus dados).

## Decisões de negócio já tomadas (não reverter sem pedir)

**Colaboradores**: `Teacher.team` = `PROFESSOR` (área fim, horista, grade de aulas) ou `ESCALA`
(área meio, escala 5x2). Listas da Gestão de Horas mostram só PROFESSOR.

**Escalas 5x2 — Recepção**
- Cada pessoa tem **horário fixo** de seg–sex; o **rodízio é só das folgas** ("Montar rodízio das folgas"):
  folga quinta ⇒ trabalha domingo; folga sexta ⇒ trabalha sábado; trabalha qui+sex ⇒ folga sáb+dom.
  No fim de semana trabalhado vale o turno de fim de semana do padrão.
- **Nunca mudar o horário de quem já trabalha no dia** para cobrir furo. Com ausência (férias,
  atestado): fim de semana primeiro — alguém do grupo "folga sáb+dom" assume o padrão de folga da
  pessoa ausente (sábado ⇒ folga na sexta; domingo ⇒ folga na quinta), no próprio horário de seg–sex.
  O que não der para cobrir assim vira **conflito sinalizado** para ajuste manual.
- Aprovar/publicar com conflito é permitido **com justificativa** (fica no histórico).

**Feriados (tela Escalas → Feriados)**: regra básica = **como sábado** (horário, equipe e postos de
sábado do setor). Recepção = horário próprio **07h–14h, 1 pessoa, rodízio** pelo histórico.
Lanchonete, Cozinha e Limpeza = como sábado. Todo feriado pede confirmação; dá para ajustar um
feriado específico (Nação inteira ou setor). Feriado no fim de semana usa o horário do próprio dia.
**FUNAP** (6x1, 44h, até 2h de intervalo) trabalha o feriado normalmente e só folga nos dias fixos.

**Ausências de professor**: lançadas antes de gerar a competência valem quando ela for gerada
(a prévia mostra as aulas pendentes e oferece "Gerar competência agora").

**Kanban de Marketing**: estilo Trello (navegação lateral, colunas com rolagem própria,
"Adicionar um cartão"), imagens no cartão (PNG/JPG/WEBP/GIF ≤ 10 MB, sem SVG; a primeira é a capa),
link direto `?tarefa=<id>` e envio pelo WhatsApp (link exige login).
