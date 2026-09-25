# 05 · MVP × Fase 2 e plano de implementação

Item **11** da entrega + o plano pedido antes do código. Atualizado com as
respostas da Nação e o [diagnóstico da planilha](06-diagnostico-da-planilha.md).

---

## 0. O que mudou com as respostas

| Resposta | Consequência no projeto |
|---|---|
| Aula com 2 pessoas: **as duas recebem**. A ideia inicial é **só calcular horas** | Cada pessoa escalada recebe a duração cheia. **Financeiro sai do MVP** e vai inteiro para a Fase 2 |
| **Cancelar aulas não dadas por motivos específicos** | Catálogo de motivos de cancelamento, com "conta hora do professor?" por motivo e relatório por motivo |
| **DSR: contabilidade** | Removido do escopo. O sistema exporta horas e dias da competência |
| **Áreas**: Nação Fit (Academia) · CrossFit (CrossFit, HYROX, Funcional, GAP, Fit Dance, Mobilidade 30 min, Funcional Beach) · Futevôlei (Futevôlei, Base Forte, Saque e Entra) | Seed real de áreas e modalidades. Mobilidade nasce com 30 min |
| **Planilha** compartilhada | Importador com os 4 layouts reais e validação contra a HORAS MENSAIS (doc 06) |
| **Criação/exclusão de aulas em dias específicos** | Aula avulsa em várias datas, excluir nesta data, suspender entre datas ([03 §6.2](03-regras-de-negocio.md#62-criação-e-exclusão-em-dias-específicos)) |
| **Fechamento 26 → 25** | Competência com `start_date`/`end_date`, dia de corte parametrizável ([03 §1.1](03-regras-de-negocio.md#11-competência-26--25)) |

## 1. Escopo

### MVP: horas, ponta a ponta

| # | Item | Etapa |
|---|---|---|
| 1 | Login | E1 |
| 2 | Usuários e permissões (RBAC + escopo por área) | E1 |
| 3 | Professores (+ apelidos para importação) | E2 |
| 4 | Modalidades, tipos de atividade, espaços | E2 |
| 5 | Áreas, centros de custo, motivos de cancelamento, feriados | E2 |
| 6 | Grade semanal com vigência | E3 |
| 7 | **Importação da planilha atual** (4 layouts) + conferência | E3 |
| 8 | Geração automática da competência 26→25 + feriados | E4 |
| 9 | Cálculo das horas (ledger) | E4 |
| 10 | Substituições, faltas, cancelamentos com motivo | E5 |
| 11 | Aulas avulsas/extras em várias datas, exclusão pontual, suspensão entre datas | E5 |
| 12 | Férias/afastamentos em lote | E5 |
| 13 | Tela **Hoje** (mobile), **Pendências**, Dashboard operacional | E4–E5 |
| 14 | Fechamento da competência + aprovação por área | E6 |
| 15 | Ajustes de competências anteriores | E6 |
| 16 | Extrato do professor | E6 |
| 17 | Exportação XLSX/CSV (inclusive no formato da HORAS MENSAIS) | E7 |
| 18 | Auditoria + histórico de alterações | E1 → todas |

### Fase 2

- **Financeiro**: tabelas N1–N5, valor por professor/modalidade/tipo com
  vigência, adicionais, gratificações, descontos, custo por
  modalidade/centro de custo, dashboard financeiro
- Notificações por e-mail/WhatsApp (in-app já no MVP)
- Portal do professor (extrato + contestação)
- Comparativo entre competências e dashboards avançados
- PDF do extrato
- API pública `/api/v1` + webhooks
- Integração ponto/presença: escala × ponto automática
- Escalas de outras equipes (a planilha tem "Escala Recepção")

## 2. Etapas

Cada etapa segue o ciclo: **o que será construído → arquivos →
implementação → migration → seed → testes → correções → só então avança.**
Cada etapa termina com um commit verde (`typecheck` + `test` + `build`).

| Etapa | Entrega | Testes que fecham a etapa |
|---|---|---|
| ✅ **E0 · Fundação** | App `horas/` (Next 15, TS estrito, Tailwind v4, componentes no padrão shadcn (cva + tailwind-merge), Prisma), design system Nação, Postgres local via Docker | Build + fumaça no Chromium (desktop e celular) |
| ✅ **E1 · Identidade e auditoria** | Sessão própria (scrypt + token HMAC), `users/roles/permissions/scopes`, `assertCan()`, `areaWhere()`, `audit()` transacional, trigger somente-inclusão, telas de Usuários, Histórico e troca de senha | 43 testes: RBAC por papel, escopo por área, 403 sem gravar nada, login sem oráculo, auditoria atômica e imutável (`UPDATE`/`DELETE`/`TRUNCATE` recusados) |
| ✅ **E2 · Cadastros** | Áreas e modalidades reais, tipos de atividade, espaços, motivos de cancelamento, professores (+ habilitações, contratos, apelidos), feriados nacionais + DF 2026–2027, configuração do corte (26) | Exclusion de vigência, soft delete, escopo |
| ✅ **E3 · Grade + importação** | Slots + versões, editor DnD, "somente nesta data" × "a partir desta data". **Importador dos 4 layouts** com preview, apelidos e **relatório de conferência** contra o PADRÃO da HORAS MENSAIS | **Cenário 5**. Parser de cada layout com fixtures anonimizadas. Nome desconhecido bloqueia a importação |
| ✅ **E4 · Motor da competência** | `domain/calendar` + `domain/ledger` puros, `generatePeriod` 26→25 idempotente, política de feriado, calendário, dashboard | **Cenários 1 e 2**. Fronteira 25/26. Mobilidade = 0h30. Idempotência. Invariante de previstas. Contagem de dias da semana (26/08–25/09 = 4·4·5·5·5·4·4) |
| **E5 · Exceções** | Drawer da aula, tela **Hoje**, substituição/falta/cancelamento com motivo/avulsa multi-data/exclusão/suspensão/horário/reversão, **Ausências em lote**, **Pendências** | **Cenários 3 e 4**. Cancelamento que conta hora. Suspensão com preview. Reversão. Playwright: substituir no celular em ≤ 4 toques |
| **E6 · Fechamento** | Máquina de estados, aprovação por área, snapshot de horas, ajustes de competência anterior, edição pós-fechamento com diff, extrato | **Cenário 6**. Snapshot imutável. **Competência demo bate 7h30 / 3h / 2h** |
| **E7 · Relatórios e exportação** | Horas por professor/modalidade/área/tipo, faltas, substituições, avulsas, canceladas **por motivo**, ausências. XLSX/CSV, inclusive um layout espelho da HORAS MENSAIS para a transição. Central de notificações in-app | O export confere com o fechamento. CSV com `;` e BOM (Excel BR) |
| **E8 · Endurecimento e deploy** | RLS deny-all + revokes, rate limit no login, headers de segurança, backup, guia "colocar no ar" (Vercel + Supabase) | Checklist de segurança |
| **Implantação** | Importar a grade real → conferência → **rodada em paralelo** numa competência (sugestão: Novembro/2026 = 26/10–25/11) → desligar a planilha | Relatório de diferenças sistema × planilha, com zero diferença sem explicação |

E4, E5 e E6 são ~60% do esforço. Sem o financeiro, o MVP fica
sensivelmente mais enxuto.

## 3. Estratégia de testes

| Nível | Ferramenta | O que cobre |
|---|---|---|
| Domínio | Vitest, sem I/O | Calendário 26→25, vigência, ledger, invariantes, com **property-based** (fast-check): "gerar 2× = gerar 1×", "previstas = próprias + ausências + canceladas + aguardando" |
| Importação | Vitest + fixtures | Um arquivo por layout, com nomes fictícios e a mesma estrutura da planilha real |
| Serviço | Vitest + Postgres real (Docker) | Transações, triggers, escopo, fechamento, Cenário 6 |
| E2E | Playwright | Substituição pelo celular, fechamento ponta a ponta com o seed |

Regra: **nenhum número de hora aparece na tela sem um teste que o produza.**

## 4. Decisões tomadas (dá para mudar)

| Decisão | Por quê |
|---|---|
| Ocorrências **materializadas** ao gerar a competência | Exceção precisa de algo concreto para apontar. Snapshot fácil |
| `class_assignments` separado de `class_occurrences` | Aula com várias pessoas e substituição parcial sem gambiarra |
| Tipo de atividade com "conta hora" | Plantão, coordenação, reunião e curso somam hora como aula, sem virar exceção |
| Exceções append-only com `before/after` | Auditoria nativa e "desfazer" seguro |
| Aprovação **por área** | Se o coordenador sair, a área continua |
| Minutos inteiros | Mobilidade de 30 min é 0h30, não 1h |
| Competência nomeada pelo mês de término | "Setembro" = 26/08–25/09, como a folha é paga (confirmar, §5) |
| App em `horas/`, irmão de `athx/` | Deploy independente na Vercel |

## 5. Respostas da Nação (rodada 2)

| Pergunta | Resposta | No sistema |
|---|---|---|
| Contraturno/Kids e Lutas | **Entram** | Áreas próprias "Contraturno / Kids" e "Lutas", sob o admin até terem coordenador |
| Nome da competência | 26/08–25/09 é paga na **folha de setembro** | "Setembro/2026" = 26/08–25/09 |
| Cancelamento que conta hora | O motivo principal é **falta de professor** | "Falta de professor" é o primeiro motivo. Nenhum motivo conta hora por padrão |
| Personal | **Não conta**: só controle do espaço | Tipo "Personal" com `conta hora = não` |
| Coordenação | **Entra, lançada manualmente** | Lançamentos manuais de horas ([03 §6.3](03-regras-de-negocio.md#63-lançamentos-manuais-de-horas)) |
| Plantão | **1h de plantão = 1h** | Tipo "Plantão" conta hora |
| Coordenadores | Maria · Juliana · Rafa · Ramon | Tabela abaixo |

### Áreas de coordenação

| Área | Coordenação | Modalidades (seed; editável no admin) |
|---|---|---|
| Nação Fit (Academia) | Maria | Musculação (plantão) |
| CrossFit | Juliana | CrossFit |
| Aulas Coletivas | Rafa | HYROX, Funcional, GAP, Fit Dance, Mobilidade (30 min), Funcional Beach, Core |
| Futevôlei | Ramon | Futevôlei, Base Forte, Saque e Entra |
| Lutas | admin | Muay Thai, Boxe, Jiu-Jitsu, Judô |
| Contraturno / Kids | admin | Natação, Funcional Kids, Futebol, Vôlei, Futevôlei Kids |

> A divisão entre **CrossFit** e **Aulas Coletivas** é uma suposição:
> trocar uma modalidade de área é uma edição no admin, sem código.
