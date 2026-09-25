# 01 · Produto e arquitetura — NAÇÃO | GESTÃO DE HORAS

> **A grade é fixa. O calendário muda. A gestão trabalha nas exceções. O sistema calcula o resto.**

Este documento cobre os itens **1 (arquitetura geral)** e **4 (modelo de
permissões)** da entrega. Os demais estão em:

| Doc | Conteúdo |
|---|---|
| [`02-banco-de-dados.md`](02-banco-de-dados.md) | Modelo do banco, relacionamentos, índices, constraints |
| [`03-regras-de-negocio.md`](03-regras-de-negocio.md) | Regras, exceções, cálculo de horas, fechamento, financeiro |
| [`04-telas-fluxos-ux.md`](04-telas-fluxos-ux.md) | Mapa de telas, fluxos por perfil, UX desktop e mobile |
| [`05-plano-de-implementacao.md`](05-plano-de-implementacao.md) | MVP × Fase 2, etapas, testes, decisões em aberto |

---

## 1. O produto em uma tela

```
      CAMADA 1                  CAMADA 2                     CAMADA 3
   GRADE PADRÃO   ──gera──►  OCORRÊNCIAS DA      ◄──ajusta──  EXCEÇÕES
                             COMPETÊNCIA (26→25)
 (recorrente, com           (uma linha por aula          (falta, férias,
  vigência/versão)           por data, idempotente)       substituição, extra…)
                                     │
                                     ▼
                         LEDGER DE HORAS (derivado)
                     minutos por professor × modalidade × tipo
                                     │
                     ┌───────────────┴────────────────┐
                     ▼                                ▼
            FECHAMENTO OPERACIONAL             MOTOR FINANCEIRO (Fase 2)
          (horas, aprovação por área)     (tabelas de valor, adicionais,
                     │                     vigências — plugável)
                     ▼                                │
              COMPETÊNCIA FECHADA  ◄──── snapshot ────┘
                     │
                     ▼
          Extrato · Relatórios · XLSX/CSV/PDF · API/Webhooks
```

Três princípios que viram código:

1. **Nada é recriado todo mês.** A grade é cadastrada uma vez, com vigência.
   A competência (26 do mês anterior → 25) é *gerada* a partir dela.
2. **Nada é apagado.** Exceções são registros *append-only*; desfazer é
   registrar uma reversão. Mudança de grade fecha uma versão e abre outra.
3. **Hora ≠ dinheiro.** O motor operacional produz *minutos*. O financeiro
   consome minutos e aplica regras. Se a regra de remuneração mudar amanhã,
   nenhuma hora muda. **O MVP entrega só horas**. O financeiro entra na
   Fase 2 sem mexer no operacional, e o DSR fica com a contabilidade.

---

## 2. Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Framework | **Next.js 15** (App Router) + **TypeScript estrito** | Mesmo padrão dos dois apps da Nação já no repo; Server Actions eliminam boilerplate de API interna |
| UI | **Tailwind v4** + **shadcn/ui** (Radix) + **lucide** | Componentes acessíveis, zero lock-in (o código fica no repo) |
| Calendário / DnD | **dnd-kit** (grade semanal) | Leve, acessível, funciona com toque |
| Formulários | **react-hook-form** + **zod** | O mesmo schema zod valida no cliente *e* no servidor |
| Banco | **PostgreSQL 16** — Supabase em produção, Docker/Supabase CLI local | Relacional de verdade: FKs, constraints, exclusion constraints para vigência |
| ORM | **Prisma 6** + SQL puro nas migrations quando o Prisma não expressa (exclusion constraints, views, triggers de auditoria) | Já usado no repo; tipagem ponta a ponta |
| Auth | **Sessão própria em banco**: e-mail + senha com scrypt, token opaco (o banco guarda só o HMAC), revogável. Mesmo padrão do app Quem Chegou? | Funciona igual no local, nos testes e na Vercel + Supabase Postgres, sem serviço extra. O admin gera senha provisória (troca obrigatória no 1º acesso). MFA/TOTP e "esqueci a senha" por e-mail ficam na Fase 2. Trocar por Supabase Auth mexe só em `server/auth/session.ts` |
| Datas | **date-fns** + `date-fns-tz`, fuso fixo **America/Sao_Paulo** | Aula é `DATE` + `TIME` locais — nunca `timestamptz` para escala |
| Exportação | **exceljs** (XLSX), CSV nativo, **@react-pdf/renderer** (PDF) | Sem serviço externo |
| Gráficos | **Recharts** (dashboard; financeiro na Fase 2) | Simples, suficiente |
| Testes | **Vitest** (domínio puro) + Vitest com Postgres real (integração) + **Playwright** (fluxo mobile crítico) | O cálculo é o produto: ele tem que ser provado |
| Deploy | **Vercel** + **Supabase** | Baixo custo, zero servidor para cuidar |

Nada de microserviço, fila gerenciada ou GraphQL. Um monólito modular bem
cortado atende dezenas de professores e milhares de aulas/mês com folga.

---

## 3. Camadas do código

```
horas/src/
├── app/                        rotas (App Router) — só orquestra
│   ├── (app)/hoje              tela mobile-first do coordenador
│   ├── (app)/grade             grade semanal (DnD)
│   ├── (app)/calendario        visão mensal
│   ├── (app)/professores       lista e perfil
│   ├── (app)/pendencias        aulas sem professor, decisões de feriado
│   ├── (app)/fechamento        competência, aprovação, extrato
│   ├── (app)/relatorios
│   ├── (app)/admin             modalidades, áreas, centros de custo, feriados,
│   │                           tabelas de valor, usuários, importação, auditoria
│   └── api/v1                  API interna/externa versionada + webhooks
│
├── domain/                     ⭐ NÚCLEO PURO — sem Prisma, sem Next, sem I/O
│   ├── calendar/               expansão grade×competência 26→25, vigência, feriados
│   ├── occurrences/            máquina de estados da aula
│   ├── ledger/                 aula → linhas de minutos (o "cálculo")
│   ├── payroll/                consolidação, snapshot, diff pós-fechamento
│   └── finance/                (Fase 2) resolução de valor, regras
│
├── server/                     aplicação — casos de uso transacionais
│   ├── auth/                   sessão Supabase, RBAC, escopo por área
│   ├── services/               generateMonth, registerException, applyLeave,
│   │                           closePeriod, approveArea, importSchedule…
│   ├── repositories/           acesso Prisma
│   ├── audit/                  gravação de audit_logs na mesma transação
│   ├── events/                 outbox de eventos de domínio (webhooks futuros)
│   └── notifications/          regras → central in-app (canais plugáveis)
│
├── components/                 design system Nação (shadcn customizado)
└── lib/                        env, formatação (minutos→"1h30"), moeda, datas
```

**Regra de dependência:** `app → server → domain`. O `domain` não importa
nada de fora. É ali que moram os 6 cenários obrigatórios de teste — rodam em
milissegundos, sem banco.

Toda escrita passa por um **caso de uso** (`server/services`) que, numa única
transação:

1. autentica e autoriza (papel **e** escopo de área);
2. valida com zod;
3. verifica se a competência está fechada (e exige permissão especial);
4. grava a mudança;
5. grava `audit_logs` (antes/depois);
6. grava evento na outbox;
7. marca o fechamento como "revisão necessária" se tocou competência fechada.

Se qualquer passo falha, nada é gravado.

---

## 4. Modelo de permissões (RBAC + escopo)

Permissão responde **"o que"**. Escopo responde **"onde"**.

### 4.1 Papéis

| Papel | Resumo |
|---|---|
| **ADMIN** | Tudo. Único que fecha/reabre competência e edita tabelas de valor. |
| **COORDENADOR** | Opera a escala e aprova horas **das suas áreas de coordenação** (Nação Fit, CrossFit, Futevôlei). |
| **CONSULTA** (DP / Financeiro) | Leitura de fechamento e relatórios, com ou sem valores conforme permissão. |
| **PROFESSOR** *(arquitetura pronta, fora do MVP)* | Vê o próprio extrato; futuramente confirma/contesta. |

Papéis são **dados** (`roles`, `permissions`, `role_permissions`), não enum
no código. Um admin pode criar "Supervisor Kids" combinando permissões.

### 4.2 Permissões (granulares, verificadas no servidor)

| Permissão | ADMIN | COORD | CONSULTA | PROF* |
|---|:-:|:-:|:-:|:-:|
| `schedule.view` | ✅ | 🟦 | ✅ | — |
| `schedule.edit` (grade padrão) | ✅ | 🟦 | — | — |
| `month.generate` | ✅ | — | — | — |
| `occurrence.exception` (falta, subst., extra, cancelar) | ✅ | 🟦 | — | — |
| `leave.manage` (férias/afastamentos) | ✅ | 🟦 | — | — |
| `teacher.view` | ✅ | 🟦 | ✅ | self |
| `teacher.edit` | ✅ | — | — | — |
| `teacher.view_personal` (CPF, telefone) | ✅ | 🟦 | opcional | self |
| `payroll.view_hours` | ✅ | 🟦 | ✅ | self |
| `payroll.approve_area` | ✅ | 🟦 | — | — |
| `payroll.admin_review` / `payroll.close` / `payroll.reopen` | ✅ | — | — | — |
| `payroll.edit_closed` | ✅ | — | — | — |
| `payroll.adjust` (ajuste de competência anterior) | ✅ | 🟦 | — | — |
| `finance.view` *(Fase 2)* | ✅ | opcional 🟦 | opcional | self |
| `finance.edit_rates` *(Fase 2)* | ✅ | — | — | — |
| `admin.catalog` (modalidades, áreas, CC, feriados) | ✅ | — | — | — |
| `admin.users` | ✅ | — | — | — |
| `audit.view` | ✅ | 🟦 | — | — |
| `import.run` | ✅ | — | — | — |

🟦 = somente dentro das áreas do usuário · *PROF = Fase 2

### 4.3 Escopo por área

- Cada **modalidade** pertence a uma **área de coordenação**. Áreas
  iniciais: **Nação Fit** (Academia) · **CrossFit** (CrossFit, HYROX,
  Funcional, GAP, Fit Dance, Mobilidade, Funcional Beach) · **Futevôlei**
  (Futevôlei, Base Forte, Saque e Entra).
- `user_area_scopes` liga usuário ↔ área, com flag `can_view_finance`.
- Toda consulta passa por `scopeFilter(user)`, que injeta
  `modality.area_id IN (...)` — **no repositório, não no componente**.
  Esquecer um filtro na tela não vaza dado, porque a tela nunca recebe o dado.
- Um professor que dá aula em duas áreas aparece para os dois coordenadores,
  mas cada um vê **só as aulas da própria área** (e, se tiver
  `finance.view`, só o custo delas).

### 4.4 Defesa em profundidade

- **Servidor é a única porta.** O browser nunca fala com o Postgres; o
  schema da aplicação é `REVOKE ALL` para os papéis `anon`/`authenticated`
  do Supabase e com **RLS ligada e sem policies** → a API REST automática
  do Supabase não enxerga nada, mesmo com a chave pública.
- **Valores financeiros** só saem do servidor por DTOs específicos
  (`toFinanceDTO`) que checam `finance.view` + escopo. DTOs de horas não têm
  campo de valor — não dá para "esquecer de esconder".
- **Competência fechada**: trigger no banco rejeita escrita em
  `class_occurrences`/`class_exceptions` de período `FECHADO` a menos que a
  transação declare `SET LOCAL app.allow_closed_edit = 'on'` — o que só o
  caso de uso com `payroll.edit_closed` faz. Dupla trava: app + banco.
- Sessão de 12h, revogável. Desativar usuário ou gerar nova senha derruba
  todas as sessões dele na hora.
- **Senha provisória = zero permissões** até a troca, inclusive para Server
  Actions chamadas direto (a trava está em `loadPrincipal`, não na tela).
- Login com mensagem única para e-mail inexistente e senha errada, com o
  mesmo custo de tempo (sem oráculo), e toda recusa auditada.
- Auditoria somente-inclusão: trigger no banco bloqueia `UPDATE`, `DELETE`
  e `TRUNCATE` em `audit_logs`. Hash de senha e tokens são removidos do log.
- Dependências: o `npm audit` aponta avisos no postcss embutido no Next e no
  CLI do Prisma. São ferramentas de build/dev que não processam entrada de
  usuário. O app está na linha 15.5.x de backport de segurança do Next.

---

## 5. Integrações (preparação, sem integração fictícia)

| Peça | O que é |
|---|---|
| `external_ids` | `(entity_type, entity_id, system, external_id)` — um professor pode ter ID no sistema de ponto, no Tecnofit, no ERP, sem poluir as tabelas |
| `domain_events` (outbox) | Cada caso de uso grava o evento na mesma transação (`occurrence.substituted`, `payroll.closed`…). Um worker (cron Vercel) entrega |
| `webhook_subscriptions` | URL + segredo HMAC + eventos assinados. Entrega com retry e log |
| `api_tokens` | Tokens de serviço com escopo e hash (nunca em claro) |
| `/api/v1/*` | API REST versionada: professores, ocorrências por período, extrato, fechamento. Documentada em OpenAPI |
| `attendance_records` *(Fase 2)* | Registros de ponto/presença importados → comparados com a escala → divergências |

Nenhum endpoint de terceiro é inventado. A comparação **ESCALA × PONTO** fica
modelada e documentada, esperando o sistema real.

---

## 6. Notificações

Central in-app (`notifications`) alimentada por **regras** avaliadas por cron
(de hora em hora) e por eventos:

- aula nas próximas 24h sem professor;
- professor inicia férias amanhã;
- feriado na competência com decisão pendente;
- N pendências para o fechamento;
- área que ainda não aprovou a competência (a partir do dia X).

Canal é interface (`NotificationChannel`): `inApp` no MVP; `email` e
`whatsapp` entram na Fase 2 sem tocar nas regras.

---

## 7. Segurança e LGPD

- Dado pessoal mínimo: CPF é opcional e mascarado na UI; telefone/e-mail só
  com `teacher.view_personal`.
- Foto em Supabase Storage com URL assinada de curta duração.
- Logs estruturados sem PII e sem segredos.
- `audit_logs` com IP e user-agent quando disponíveis.
- Backup: PITR do Supabase (plano pago) ou `pg_dump` diário para bucket
  (plano gratuito), documentado em `deployment.md`.
- Soft delete (`deleted_at`) em cadastros; **nunca** em exceções, ocorrências
  de período fechado, snapshots de folha ou auditoria.
