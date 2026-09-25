# 03 · Regras de negócio, exceções, fechamento e financeiro

Itens **7, 8 e 9** da entrega. Cada regra aqui vira um teste em `domain/`.

---

## 1. Vocabulário

| Termo | Significado |
|---|---|
| **Slot** | "A aula de segunda 05:00 de HYROX". Identidade estável |
| **Versão do slot** | O que o slot é num intervalo de datas (horário, duração, modalidade, professor) |
| **Ocorrência** | O slot numa data concreta: *HYROX 05:00 em 14/09/2026* |
| **Assignment** | Uma "cadeira de professor" numa ocorrência. É o que gera hora |
| **Exceção** | Um fato registrado sobre uma ocorrência/assignment. Nunca editado, nunca apagado |
| **Competência** | O mês de folha (`payroll_period`) |

## 2. Geração do mês (CAMADA 1 → CAMADA 2)

`generateMonth(ano, mês)` — **idempotente**, pode rodar quantas vezes quiser.

```
para cada dia D do mês:
  para cada versão V com V.weekday = diaDaSemana(D)
                    e V.valid_from ≤ D ≤ (V.valid_to ?? ∞):
    upsert ocorrência (V.slot_version_id, D)       ← unique, não duplica
      planned_* = V.*
      para cada professor de V → assignment PREVISTA
    se D é feriado → aplica política (§4)
    se o professor tem leave ativa em D → aplica a leave (§5)
    se o professor está inativo/desligado em D → AUSENTE_PENDENTE
```

- A regra de vigência resolve o **Cenário 5** sozinha: grade muda no dia 15
  ⇒ dias 1–14 casam com a versão antiga, 15+ com a nova.
- Mês de 5 segundas gera 5 ocorrências (**Cenário 1**). Não há "4 semanas"
  hard-coded em lugar nenhum: o calendário real manda.
- Ocorrências já existentes **não são sobrescritas** se tiverem exceção.
- Competência `FECHADO` nunca é regerada.

Resumo exibido após gerar: **aulas previstas · horas previstas ·
professores escalados · pendências criadas** (feriados a decidir, aulas sem
professor por férias).

### 2.1 Mudança de grade depois do mês gerado

Ao editar um slot, o usuário escolhe:

| Opção | Efeito |
|---|---|
| **Aplicar somente nesta data** | Não mexe na grade. Registra exceção `ALTERACAO_PONTUAL` na ocorrência |
| **Alterar grade a partir desta data** | Fecha a versão (`valid_to = D−1`), cria nova versão (`valid_from = D`). Ocorrências ≥ D **sem exceção** em competências abertas são realinhadas à nova versão. Ocorrências ≥ D **com exceção** ficam `needs_review` e aparecem em Pendências — o sistema não decide por cima do coordenador |

Excluir um slot = encerrar a vigência. A linha continua existindo.

## 3. Cálculo de horas (o "ledger")

Função pura: `ledger(ocorrências, assignments, ajustes) → linhas`.
Cada assignment produz **uma** linha:

| Situação do assignment | Linha gerada | Quem recebe |
|---|---|---|
| `PREVISTA` (modalidade sem confirmação) ou `REALIZADA` | `PROPRIA +min` | professor previsto |
| `SUBSTITUIDA` | `SUBSTITUICAO +min` para o executor; `AUSENCIA 0` (com motivo) para o previsto | executor |
| Aula extra (`planned_teacher_id = null`) | `EXTRA +min` | executor |
| `CANCELADA` | `CANCELADA 0` (informativa) | — |
| `AUSENTE_PENDENTE` | `AUSENCIA 0` + gera pendência | — |
| `PREVISTA` em modalidade com `requires_confirmation`, data passada | `AGUARDANDO 0` + pendência | — |
| Ajuste de minutos (compensação/competência anterior) | `AJUSTE ±min` | professor |

Totais do professor no mês:

```
Previstas         = Σ planned minutes onde ele é planned_teacher (antes das exceções)
Realizadas próprias = Σ PROPRIA
Substituições feitas = Σ SUBSTITUICAO
Extras            = Σ EXTRA
Ausências         = Σ minutos previstos não dados, por motivo (falta, férias…)
Canceladas        = Σ minutos previstos cancelados
Ajustes           = Σ AJUSTE (±)
TOTAL CONSIDERADO = próprias + substituições + extras + ajustes
```

**Invariante testado em toda build:** para cada professor,
`Previstas = próprias + ausências + canceladas + aguardando`. Se não fecha,
o teste quebra — é assim que se confia num cálculo de folha.

Minutos são inteiros; formatação só na borda (`90 → "1h30"`).

## 4. Feriados

Nunca some aula em silêncio. Ao cadastrar feriado (ou ao gerar um mês que
contém um), a política decide:

| Política | Efeito |
|---|---|
| `CANCELAR_TODAS` | Exceção `CANCELADA (feriado)` em cada ocorrência, com autor = quem definiu a política |
| `MANTER_TODAS` | Ocorrências seguem `PREVISTA`, marcadas com o selo do feriado (vira condição para adicional, se houver regra) |
| `DECIDIR_INDIVIDUALMENTE` | Ocorrências ficam `AGUARDANDO_DECISAO_FERIADO` e vão para Pendências, com ações rápidas "manter"/"cancelar" em lote |

Override por modalidade (`holiday_modality_policies`): "Natal cancela tudo,
exceto Nação Fit".

**Cenário 2:** 5 segundas, uma é feriado cancelado ⇒ 4h.

## 5. Férias e afastamentos em lote

`applyLeave(professor, tipo, início, fim, cobertura)`:

1. Busca todos os assignments do professor no intervalo, **em todas as
   competências já geradas** (**Cenário 4**).
2. Mostra: *"Rafael possui 17 aulas programadas nesse período"*, agrupadas
   por semana/modalidade.
3. Para cada uma, o gestor escolhe (em lote ou individual): **cancelar**,
   **aguardar substituto** (`AUSENTE_PENDENTE`) ou **substituir por X**.
   Sugestão automática de substituto: professores habilitados na modalidade,
   sem conflito de horário, ordenados por quem já cobriu essa aula antes.
4. Cada efeito vira uma `class_exception` com `leave_id` — dá para ver
   "tudo que as férias do Rafael causaram" e desfazer em bloco.
5. Meses gerados **depois** também respeitam a leave (passo do §2).

Encurtar/cancelar férias = exceções de reversão nas aulas que saíram do
intervalo. Nada é apagado.

## 6. Exceções — catálogo e efeitos

Toda exceção grava: autor, data/hora, tipo, motivo, observação, professor
original, professor substituto, **estado anterior e posterior** (jsonb).

| Tipo | Efeito no assignment/ocorrência |
|---|---|
| `FALTA` | previsto → ausência (FALTA). Pergunta na mesma tela: **substituir por…** / **cancelar aula** / **deixar pendente** |
| `FERIAS` / `ATESTADO` / `FOLGA` | idem, com motivo correspondente (normalmente via leave em lote) |
| `SUBSTITUICAO` | `SUBSTITUIDA`, `executing_teacher_id = X`. **Cenário 3:** Rafael 3h, João +1h |
| `AULA_CANCELADA` | Ocorrência e todos os assignments `CANCELADA` |
| `AULA_EXTRA` | Cria ocorrência `origin = EXTRA` + assignment sem previsto |
| `ALTERACAO_HORARIO` | Muda `start_time`/`duration_min` da ocorrência (só esta data). Duração muda os minutos |
| `CONFIRMACAO` | `PREVISTA → REALIZADA` (modalidades com confirmação; aceita lote "confirmar semana") |
| `COMPENSACAO` | Cria `minute_adjustment ±min` no mês |
| `REVERSAO` | Restaura o `before` de uma exceção anterior |
| `OUTRO` | Motivo livre + efeito escolhido entre os acima |

Validações (avisam, não travam — o coordenador sabe coisas que o sistema
não sabe):

- substituto não habilitado na modalidade → alerta amarelo;
- substituto com outra aula no mesmo horário → alerta vermelho, exige
  confirmação;
- substituto = professor previsto → bloqueia.

## 7. Confirmação: gestão por exceção

- Padrão: aula sem exceção **é considerada realizada**. Ninguém confirma
  centenas de aulas.
- Modalidades com `requires_confirmation = true` (ex.: Kids, se a Nação
  quiser) exigem confirmação; aulas passadas não confirmadas viram pendência
  e **bloqueiam a aprovação da área**, não o resto da Nação.
- No fechamento, as `PREVISTA` implícitas são materializadas como
  `REALIZADA` por um autor `SISTEMA` — o histórico registra que foi
  presunção, não confirmação.

## 8. Fechamento mensal

### 8.1 Máquina de estados da competência

```
   ABERTO ──(admin: enviar p/ revisão, ou auto no dia 1 do mês seguinte)──►
   EM_REVISAO_COORDENACAO ──(todas as áreas aprovaram)──►
   APROVADO_COORDENACAO ──(admin: iniciar revisão)──►
   REVISAO_ADMINISTRATIVA ──(admin: fechar)──► FECHADO
                                                  │
              (admin com payroll.reopen, motivo obrigatório)
                                                  ▼
                                        REVISAO_ADMINISTRATIVA
                                        (snapshot v+1 ao refechar)
```

- A aprovação é **por área** (`period_area_approvals`): o coordenador de
  Lutas aprova Lutas sem esperar o de Raquetes. O painel mostra quem falta.
- Área só pode ser aprovada com **zero pendências** dela (aula sem professor,
  feriado sem decisão, confirmação faltando, conflito de grade).
- Alteração numa área já aprovada (competência ainda aberta) devolve a área
  para `EM_REVISAO` automaticamente e notifica o coordenador.

### 8.2 Snapshot

Ao **fechar**:

1. materializa realizadas implícitas (§7);
2. roda ledger + motor financeiro;
3. grava `payroll_statements` + `payroll_statement_lines` (minutos, valor,
   `rule_trace`) — **imutáveis**;
4. grava `input_hash` (hash dos assignments/ajustes/valores usados).

Relatórios e exportações de competência fechada leem **o snapshot**, nunca
recalculam. Mudar a tabela de valores em novembro não altera a folha de
setembro — por construção.

### 8.3 Alteração depois de fechado (**Cenário 6**)

1. Exige `payroll.edit_closed` (senão: erro 403 e nada gravado).
2. Motivo obrigatório; grava `audit_logs` com antes/depois.
3. Recalcula ledger + financeiro em memória e compara com o snapshot.
4. Marca a competência `needs_review = true` e mostra o **diff**
   ("Rafael: 7h30 → 8h30, +R$ X").
5. Admin decide: **refechar** (novo snapshot `v+1`, o anterior fica) ou,
   preferível para folha já paga, **converter em ajuste** na competência
   aberta (`payroll_adjustment` com `origin_period_id`).

### 8.4 Ajustes de competências anteriores

"Professor recebeu 2h a mais em agosto" ⇒ ajuste `−120 min` lançado em
setembro com `origin_period = agosto`, motivo, responsável, data e
observação. Aparece no extrato como linha própria: **Ajuste competência
08/2026: −2h**.

## 9. Motor financeiro

Consome as linhas do ledger. Pode ser desligado sem afetar nada do
operacional.

### 9.1 Resolução do valor-hora (na **data da aula**)

Precedência, do mais específico ao mais geral — primeira que casar vence:

1. `teacher_rates` professor + modalidade + tipo de aula
2. `teacher_rates` professor + modalidade
3. `teacher_rates` professor (geral)
4. `rate_table_values` nível do contrato vigente + modalidade + tipo
5. `rate_table_values` nível + modalidade
6. `rate_table_values` nível (geral)
7. nenhum ⇒ **pendência "professor sem valor"** (não assume zero)

Todas filtradas por vigência. O professor X pode ganhar valores diferentes
em CrossFit, HYROX e Funcional, e um reajuste em outubro não toca agosto.

### 9.2 Regras (`pay_rules`)

Declarativas, avaliadas por prioridade:

| Tipo | Exemplo |
|---|---|
| `ADICIONAL_PCT` | +20% em aulas de domingo ou feriado |
| `ADICIONAL_FIXO_HORA` | +R$ X/h em aulas Kids |
| `GRATIFICACAO_FIXA` | Gratificação de coordenação R$ X/mês para cargo "Coordenador" |
| `DESCONTO` | Valor fixo ou % |
| `DSR` | Só para `contract_types.dsr_applies`: `DSR = (valor das horas ÷ dias úteis do mês) × (domingos + feriados do mês)` — fórmula parametrizável e **desligada por padrão** até o DP validar |

Cada linha do extrato guarda o `rule_trace`, então "por que deu esse valor?"
tem resposta sem abrir planilha.

Arredondamento: cálculo em centavos com minutos exatos
(`round(min × centavos_hora / 60)`), arredondamento bancário só no total da
linha.

## 10. Mês de demonstração (seed) — resultado esperado

**Setembro/2026** (1º de setembro é terça). Segundas: 7, 14, 21, 28.
Quartas: 2, 9, 16, 23, 30.

Grade:

| Dia | Hora | Modalidade | Professor | Duração |
|---|---|---|---|---|
| Seg | 05:00 | HYROX | Rafael | 60 |
| Seg | 05:00 | CrossFit | Eliseu | 60 |
| Qua | 06:00 | Funcional | Rafael | 60 |

Eventos do mês:

| Data | Evento |
|---|---|
| 07/09 | **Feriado** (Independência) — decisão individual: HYROX **cancelada**, CrossFit **mantida** |
| 14/09 | **Substituição**: Rafael (folga) → João dá o HYROX |
| 19/09 | **Aula extra**: aulão HYROX sábado 08:00, Rafael, 90 min |
| 21–25/09 | **Férias** do Eliseu → CrossFit de 21/09 coberto por João |
| 23/09 | **Falta** do Rafael no Funcional, sem substituto → aula cancelada |

Resultado:

| Professor | Previstas | Próprias | Substituições | Extras | Ausências | Canceladas | **Total** |
|---|---|---|---|---|---|---|---|
| Rafael | 9h | 6h | — | 1h30 | 2h (1h folga, 1h falta) | 1h (feriado) | **7h30** |
| Eliseu | 4h | 3h | — | — | 1h (férias) | — | **3h** |
| João | — | — | 2h | — | — | — | **2h** |
| **Nação** | 13h | 9h | 2h | 1h30 | 3h | 1h | **12h30** |

Por modalidade: HYROX **4h30** · CrossFit **4h** · Funcional **4h**.

Rafael: 4 HYROX previstas (7 cancelada, 14 folga, 21 e 28 dadas) + 5
Funcional previstas (23 falta) ⇒ 2h + 4h próprias + 1h30 extra = 7h30.
Invariante: 9h = 6h + 2h + 1h ✔.

Esse quadro é um teste de integração: o seed roda, o fechamento roda, os
números têm que bater exatamente.

## 11. Os 6 cenários obrigatórios → testes

| # | Cenário | Esperado | Camada |
|---|---|---|---|
| 1 | HYROX toda segunda, mês com 5 segundas (nov/2026) | Rafael 5h | domain/calendar |
| 2 | Uma segunda é feriado cancelado | 4h | domain/calendar + ledger |
| 3 | Rafael falta, João substitui | Rafael 3h, João +1h | domain/ledger |
| 4 | Férias de 10 a 20 | Todas as aulas do intervalo (e só elas) identificadas, inclusive de meses gerados depois | domain + service |
| 5 | Grade muda dia 15 | 1–14 versão antiga, 15+ nova, sem duplicar | domain/calendar |
| 6 | Alteração após fechamento | 403 sem permissão; com permissão: audit, recálculo, `needs_review`, snapshot anterior preservado | service (Postgres real) |

Mais: idempotência da geração, invariante de previstas, precedência de
valores, vigência de valores, isolamento de escopo (coordenador de Lutas
não lê CrossFit), trigger append-only.
