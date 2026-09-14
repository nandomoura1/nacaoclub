# Regras ainda não definidas

> Este documento existe por causa do item **§48 — NÃO INVENTAR REGRAS**.
>
> Toda regra que a especificação do evento não fechou está listada aqui, com:
> **o que falta**, **o que o sistema faz enquanto isso** e **onde ajustar**.
> Nenhuma delas foi assumida em silêncio.

---

## 0. Como o WOD 1 pontua — ✅ RESOLVIDO

Havia divergência: a organização instruiu que *"o WOD 1 gera 4 pontuações"*,
enquanto o texto do regulamento diz, na prova 1D, que *"a dupla com maior
resultado total ficará em 1º lugar no Workout"*.

**Decidido pela organização:** as quatro provas somam.

```
PONTUAÇÃO DO WOD 1 = Pts 1A + Pts 1B + Pts 1C + Pts 1D
```

A opção alternativa (`TOTAL_ONLY`, em que só a 1D pontuava) **foi removida do
sistema**. O motivo é operacional: com ela ligada, as provas 1A, 1B e 1C
apareciam na tela com posição e pontos mas não entravam no total — o
leaderboard mostrava 4 pontos onde a soma real era 7, sem nenhum aviso.
Configuração capaz de zerar em silêncio a pontuação de três provas é risco no
dia do evento, não flexibilidade.

A coluna `wod1_scoring_mode` continua existindo no banco e é simplesmente
ignorada. Não há migration a rodar.

---

## 1. Critério de desempate dentro da categoria — ✅ RESOLVIDO

**Decisão da organização:** melhor colocação no **WOD 3**.

É o **padrão do sistema** — não é preciso configurar nada para valer. Em
`/admin/settings` → *Critérios de desempate* dá para trocar, e para encadear
até três: o critério 2 só é consultado quando o 1 também empata.

| Opção | O que faz |
|---|---|
| `NENHUM` | as duplas dividem a posição, a tela mostra `EMPATE`, a decisão é de gente |
| `WOD3` | melhor colocação no WOD 3 fica na frente |
| `WOD2` | melhor colocação no WOD 2 fica na frente |
| `WOD1` | melhor colocação no WOD 1 fica na frente |

"Melhor colocação no WOD" = **menor pontuação naquele workout**. No WOD 3, que
tem uma prova só, isso é literalmente a colocação; nos WODs 1 e 2 é a soma das
provas do workout (1A+1B+1C+1D e 2A+2B+2C), que é a colocação da dupla ali.

Uma dupla **sem resultado** no WOD do critério vai para trás — não há como
comparar, e presumir a favor dela seria inventar regra.

Quando nenhum dos três critérios separar as duplas, elas continuam dividindo a
posição e a tela volta a mostrar `EMPATE`. O sistema nunca chuta um
desempate: ou existe um critério que decide, ou a decisão é da organização.

⚠️ **O campo já foi texto livre.** Até pouco tempo ele só REGISTRAVA a regra:
uma frase escrita ali não virava ordenação. Valor irreconhecível hoje cai no
padrão do evento (WOD 3), e o formulário mostra o texto antigo para
conferência.

Implementado em `src/lib/scoring/overall.ts` e espelhado na view
`athx_standings` (migration `…_0011`).

---

## 2. Pontos de duplas empatadas no mesmo valor numérico

**Falta:** confirmação de quantos pontos cada dupla empatada recebe.

**Hoje:** `COMPETITION` — 100 kg, 100 kg, 95 kg produz **1º, 1º, 3º**, e as duas
primeiras recebem **1 ponto** cada. É o padrão esportivo mais comum, mas é uma
**escolha**, não um dado da especificação.

**Alternativa disponível:** `AVERAGE` — as empatadas recebem 1,5 ponto cada.

**Onde ajustar:** `/admin/settings` → *Empates numéricos*. Mudar a opção
recalcula a classificação inteira na hora.

---

## 3. Ordenação de quem não concluiu o WOD 3

**Falta:** como classificar as duplas que estouraram o CAP de 20:00.

**Hoje:** `PENDING_DEFINITION` — todas ficam **atrás** de quem concluiu,
**empatadas entre si** e marcadas para decisão manual. O volume concluído é
gravado, mas **não** é usado para ordenar.

**Alternativas disponíveis:**
- `VOLUME_DESC` — maior volume concluído fica à frente;
- `TIED_LAST` — todas na última posição.

**Onde ajustar:** `/admin/settings` → *WOD 3 — quem não concluiu*.

---

## 4. Altura do Box Jump Over (WOD 3)

**Falta:** a altura não foi informada.

**Hoje:** a página `/wod/3` lista o movimento **sem altura** e declara a
pendência. Nenhum valor foi inventado.

**Onde ajustar:** `src/lib/wods.ts`, no item `2` da `sequencia` do WOD 3.

---

## 5. Padrão técnico dos movimentos e critérios de no-rep

**Falta:** os padrões de execução de todos os movimentos dos três WODs.

**Hoje:** não aparecem em lugar nenhum do sistema. As páginas dos WODs mostram
apenas a prescrição fornecida (movimento, volume e cargas por gênero).

**Onde ajustar:** `src/lib/wods.ts` (campo `pendencias` de cada WOD).

---

## 6. Penalidades

**Falta:** não há tabela de penalidades definida.

**Hoje:** o sistema **não aplica nenhuma penalidade automática**. Para tirar uma
dupla do ranking existe o status `DESCLASSIFICADA`, que a mantém visível na
listagem mas fora da classificação.

---

## 7. Troca de atleta fora do múltiplo de 500 m (WOD 2)

**Falta:** qual a penalidade quando a troca acontece fora do ponto permitido.

**Hoje:** o sistema apenas **recusa o lançamento** de uma distância de corrida
que não seja múltipla de 500 m — a validação existe no formulário, no schema
Zod e como `CHECK` no PostgreSQL. Não há penalidade automática.

---

## 8. Categoria das 20 duplas

**Falta:** quais duplas são **Dupla Masculina**, **Dupla Feminina** ou
**Dupla Mista** — as três categorias do evento.

**Hoje:** o seed cria as 20 duplas como **MISTA** porque a coluna é obrigatória.
O painel avisa explicitamente que a categoria precisa ser revisada.

**Onde ajustar:** `/admin/teams`, antes do evento.

---

## 9. Regra de integridade (decisão nossa, não do regulamento)

Esta **não é** uma regra de competição — é uma decisão de engenharia, e está
aqui para ficar visível e ser confirmada.

Durante o evento, algumas duplas têm resultado lançado e outras não. Somando
apenas o que existe, uma dupla com **1 WOD** pontuado teria total baixo e
apareceria à frente de quem já fez os **3**. O ranking mentiria.

**Solução:** a classificação ordena primeiro por **quantidade de WODs
pontuados** (decrescente) e só depois pelo **total de pontos** (crescente).
Duplas com resultado parcial aparecem marcadas com *"2 de 3 WODs"*.

Quando todas as duplas tiverem os três WODs publicados, essa chave deixa de
ter efeito e a classificação é exatamente a soma dos pontos.

**Onde está:** `computeStandings()` em `src/lib/scoring/overall.ts` e a view
`athx_standings` em `supabase/migrations/…_views.sql`.
