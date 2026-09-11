# Regras ainda não definidas

> Este documento existe por causa do item **§48 — NÃO INVENTAR REGRAS**.
>
> Toda regra que a especificação do evento não fechou está listada aqui, com:
> **o que falta**, **o que o sistema faz enquanto isso** e **onde ajustar**.
> Nenhuma delas foi assumida em silêncio.

---

## 1. Critério de desempate da classificação geral

**Falta:** o que decide entre duas duplas com a mesma pontuação total.

**Hoje:** as duas recebem a **mesma posição** e a tela mostra `EMPATE`. Nada é
desempatado automaticamente. A tela de Conferência lista todos os empates
pendentes antes do pódio.

**Onde ajustar:** `/admin/settings` → *Critérios de desempate* (campos
`tie_breaker_1`, `tie_breaker_2`, `tie_breaker_3`).

⚠️ Preencher esses campos **registra a regra** e faz o sistema exibi-la, mas a
aplicação continua manual: transformar o texto em ordenação automática exige
uma alteração de código em `src/lib/scoring/overall.ts` e na view
`athx_standings`. Isso é proposital — o time precisa decidir a regra antes de
alguém codificá-la.

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

**Falta:** quais duplas são Masculina, Feminina ou Mista.

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
