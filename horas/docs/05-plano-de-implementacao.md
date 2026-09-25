# 05 · MVP × Fase 2 e plano de implementação

Item **11** da entrega + o plano pedido antes do código.

---

## 1. Escopo

### MVP (os 18 itens do briefing)

| # | Item | Etapa |
|---|---|---|
| 1 | Login | E1 |
| 2 | Usuários e permissões (RBAC + escopo por área) | E1 |
| 3 | Professores | E2 |
| 4 | Modalidades | E2 |
| 5 | Centros de custo (+ áreas, catálogos) | E2 |
| 6 | Grade semanal com vigência | E3 |
| 7 | Geração automática do mês + feriados | E4 |
| 8 | Férias/afastamentos em lote | E5 |
| 9 | Substituições | E5 |
| 10 | Faltas | E5 |
| 11 | Aulas extras | E5 |
| 12 | Cancelamentos | E5 |
| 13 | Cálculo das horas | E4 (núcleo) / E6 |
| 14 | Fechamento mensal | E6 |
| 15 | Aprovação pelo coordenador | E6 |
| 16 | Relatório por professor (extrato) | E6 |
| 17 | Exportação Excel/CSV | E7 |
| 18 | Auditoria | E1 (infra) → todas |

Entram no MVP também, por serem baratos e mudarem o jogo: **Tela Hoje**,
**Pendências**, **Dashboard operacional**, **importação da planilha** (sem
ela a implantação vira digitação) e o **motor financeiro básico**
(valor por nível/modalidade/professor com vigência — sem adicionais).

### Fase 2

- Financeiro avançado: adicionais, gratificações, DSR, descontos, dashboard
  financeiro com gráficos
- Notificações por e-mail/WhatsApp (in-app já no MVP)
- Portal do professor (extrato + contestação)
- Comparativo mensal e dashboards avançados
- Relatórios em PDF
- API pública `/api/v1` + webhooks entregues
- Integração ponto/presença e conferência automática escala × ponto
- Multiunidade na UI

## 2. Etapas

Cada etapa segue o ciclo pedido: **o que será construído → arquivos →
implementação → migration → seed → testes → correções → só então avança.**
Cada etapa termina com um commit verde (`typecheck` + `test` + `build`).

| Etapa | Entrega | Testes que fecham a etapa |
|---|---|---|
| **E0 · Fundação** | App `horas/` (Next 15, TS estrito, Tailwind v4, shadcn, Prisma), design system Nação, Postgres local via Docker, CI local (`npm run check`) | smoke: build + página de login renderiza |
| **E1 · Identidade e auditoria** | Supabase Auth (+ login dev para seed local), `users/roles/permissions/scopes`, `withPermission()`, `scopeFilter()`, `audit()` transacional, trigger append-only | RBAC por papel; coordenador fora da área = 403; audit grava antes/depois; `DELETE` em audit falha |
| **E2 · Cadastros** | Modalidades, áreas, CC, unidades, tipos, cargos, níveis, vínculos, professores (+ habilitações, contratos com vigência), feriados (nacionais + DF 2026–2027 pré-carregados) | exclusion de vigência; soft delete; escopo |
| **E3 · Grade semanal** | Slots + versões, editor DnD, "somente nesta data" × "a partir desta data", histórico de versões, **importação XLSX/CSV com preview** | **Cenário 5**; importação: duplicidade, professor inexistente |
| **E4 · Motor do calendário** | `domain/calendar` + `domain/ledger` puros, `generateMonth` idempotente, política de feriado, Calendário (mês/semana/lista), Dashboard operacional | **Cenários 1 e 2**; idempotência; invariante de previstas |
| **E5 · Exceções** | Drawer da aula, tela **Hoje** mobile, substituição/falta/cancelamento/extra/horário/compensação/reversão, **Ausências em lote**, **Pendências**, sugestão de substituto | **Cenários 3 e 4**; reversão restaura estado; conflito de horário; Playwright: substituir no celular em ≤ 4 toques |
| **E6 · Fechamento** | Máquina de estados, aprovação por área, snapshot, ajustes de competência anterior, edição pós-fechamento com diff, extrato, motor financeiro básico | **Cenário 6**; snapshot imutável; precedência e vigência de valores; **mês demo bate 7h30 / 3h / 2h** |
| **E7 · Relatórios e exportação** | Horas por professor/modalidade/CC/coordenador, faltas, substituições, extras, canceladas, ausências; XLSX + CSV; histórico de alterações; central de notificações in-app | export confere com o fechamento; CSV com separador `;` e BOM (Excel BR) |
| **E8 · Endurecimento e deploy** | RLS deny-all + revokes, rate limit no login, headers de segurança, backup documentado, guia "colocar no ar" (Vercel + Supabase), README | checklist de segurança; `npm run doctor` |

Estimativa de esforço relativo: E4, E5 e E6 são ~60% do trabalho — é onde
mora o valor. E0–E2 são rápidas porque reaproveitam padrões do repo.

## 3. Estratégia de testes

| Nível | Ferramenta | O que cobre |
|---|---|---|
| Domínio | Vitest, sem I/O | Calendário, vigência, ledger, invariantes, resolução de valor, regras — **milhares de casos por property-based** (fast-check: "gerar o mês 2× = gerar 1×", "previstas = próprias + ausências + canceladas") |
| Serviço | Vitest + Postgres real (Docker, schema descartável por teste) | Transações, triggers, escopo, fechamento, Cenário 6 |
| E2E | Playwright (Chromium já disponível) | Fluxo mobile de substituição, fechamento ponta a ponta com o seed |

Regra: **nenhum número de hora aparece na tela sem um teste que o produza.**

## 4. Decisões que eu tomei (e dá pra mudar)

| Decisão | Por quê |
|---|---|
| Ocorrências **materializadas** ao gerar o mês (não virtuais) | Exceção precisa de algo concreto para apontar; consultas simples e rápidas; snapshot fácil |
| `class_assignments` separado de `class_occurrences` | Suporta aula com 2 professores e substituição parcial sem gambiarra |
| Exceções append-only com `before/after` | Auditoria nativa, "desfazer" seguro |
| Aprovação **por área**, não por coordenador | Se o coordenador sair, a área continua; dois coordenadores podem dividir uma área |
| Minutos inteiros e centavos inteiros | Folha não pode ter 0,1 + 0,2 ≠ 0,3 |
| Prisma + SQL puro nas migrations | Tipagem do Prisma + recursos do Postgres que ele não expressa |
| Supabase Auth, com login de desenvolvimento só em `NODE_ENV=development` | Recuperação de senha e MFA prontos; demo local sem conta externa |
| App em `horas/`, irmão de `athx/` | Deploy independente na Vercel (Root Directory = `horas`) |

## 5. Perguntas para a Nação (não bloqueiam o início)

1. **Aula com dois professores** (coach + estagiário) acontece? Ambos recebem
   a hora cheia? — o modelo já suporta; muda só o padrão da tela.
2. **Aula realizada por presunção**: quais modalidades exigem confirmação
   manual (Kids? personal?)
3. **DSR**: vale para quais vínculos, e qual fórmula o DP usa hoje?
4. **Feriados**: a política padrão da Nação é cancelar, manter ou decidir
   caso a caso? Quais datas especiais da Nação entram no calendário?
5. **Áreas de coordenação**: qual a lista real e quem coordena cada uma?
6. O coordenador pode ver o **custo da própria área**?
7. Quando o mês deve ser gerado automaticamente (ex.: dia 25 do anterior)?
8. Existe um modelo da planilha atual para eu calibrar o importador?
