# Como testar

Três níveis, do mais rápido ao mais completo. Escolha pelo tempo que você tem.

| Nível | O que dá para ver | Tempo | Precisa de quê |
|---|---|---|---|
| **1. Modo demo** | o sistema inteiro funcionando, com 20 duplas fictícias | 10 min | um computador com Node |
| **2. Ensaio geral** | o fluxo real do dia do evento, com o site no ar | 30 min | Supabase + Vercel prontos |
| **3. Conferência final** | a véspera, com os dados de verdade | 15 min | tudo pronto |

---

## Nível 1 — Modo demo (sem banco, sem conta, sem nada)

O jeito mais rápido de ver tudo funcionando. **Não precisa de Supabase nem
de Vercel.** O sistema sobe com 20 duplas fictícias já pontuadas.

### Instalar

Se você nunca usou Node: baixe em **[nodejs.org](https://nodejs.org)** (versão
LTS) e instale. Depois, no Terminal (Mac) ou Prompt de Comando (Windows):

```bash
git clone https://github.com/nandomoura1/nacaoclub.git
cd nacaoclub
git checkout claude/clever-allen-7ozkyk
cd athx
npm install
cp .env.example .env.local
npm run dev
```

Abra **http://localhost:3000**.

### O que olhar

- [ ] a classificação geral com as 20 duplas
- [ ] pesquisar **"marina"** — acha pelo nome do atleta
- [ ] pesquisar **"07"** — acha pelo número da dupla
- [ ] filtrar **Feminina** — repare que as posições são **renumeradas dentro
      da categoria** e o título muda para "Classificação da categoria"
- [ ] tocar numa dupla → abre o detalhe com os três WODs
- [ ] abrir as abas **WOD 1 / WOD 2 / WOD 3**
- [ ] **http://localhost:3000/display** → aperte `F11` (tela do telão)
- [ ] **http://localhost:3000/admin** → o painel, em somente leitura
- [ ] aperte `Ctrl+P` na página do leaderboard → a versão impressa, A4 paisagem

### O que NÃO dá para testar aqui

Lançar resultado, login e tempo real — tudo isso precisa de banco. É o
Nível 2.

> As duplas do demo são fictícias de propósito (Cerrado, Ipê Amarelo,
> Planalto…). Nenhum nome real de aluno aparece.

---

## Nível 2 — Ensaio geral

**Este é o teste que importa.** Faça depois de seguir o
[colocar-no-ar.md](colocar-no-ar.md), e faça **antes do dia 12**, com calma.

A ideia é simular o dia do evento com dados falsos e ver o sistema se
comportar sob as mesmas condições. No fim, você apaga tudo e volta ao ponto
de partida.

### Prepare o cenário

Você vai precisar de **duas telas ao mesmo tempo**:

- 💻 o **computador** → `/admin` (você é a organização)
- 📱 o **celular** → `/leaderboard` (você é o público)

Deixe as duas abertas lado a lado. É assim que vai ser no dia.

---

### Ensaio 1 — Cadastro

No computador, em **`/admin/teams`**:

1. edite a **Dupla 01** → coloque nomes nos dois atletas → **Salvar**
2. mude a **categoria** para *Dupla Masculina* → **Salvar**

**No celular, sem atualizar a página:** o nome novo aparece sozinho.

> ✅ Se apareceu, o tempo real está funcionando. É o coração do sistema.
> ❌ Se não apareceu, veja "Celular não atualiza sozinho" no
> [colocar-no-ar.md](colocar-no-ar.md#se-algo-der-errado).

---

### Ensaio 2 — Lançar o WOD 1

Em **`/admin/wod/1`**, com a **Bateria 1** selecionada:

1. preencha cargas em **3 duplas** — invente números
2. repare que o **TOTAL** vai somando enquanto você digita
3. **SALVAR RESULTADOS**

**No celular:** nada mudou. Correto — ainda é rascunho.

4. **PUBLICAR RANKING** → confirmar

**No celular:** agora sim o ranking apareceu.

> ✅ É o que protege você: um erro de digitação não vai para o telão até
> você mandar.

---

### Ensaio 3 — A regra dos 500 m

Em **`/admin/wod/2`**, tente lançar uma corrida de **3,2 km** e salvar.

> ✅ O sistema recusa e explica: a troca de atleta só acontece a cada 500 m,
> então a corrida só pode ser 0,5 · 1,0 · 1,5 · 2,0 km…
>
> Tente **3,5** — aceita.

---

### Ensaio 4 — Empate

Em **`/admin/wod/1`**, dê a **duas duplas exatamente a mesma carga total**.
Publique.

> ✅ As duas aparecem na **mesma posição** (ex.: 3º e 3º, e a próxima é 5º),
> com a tarja **EMPATE**. O sistema **não inventa** um desempate — quem
> decide é a organização.
>
> Veja a lista de empates pendentes em **`/admin/results`**.

---

### Ensaio 5 — Quem não concluiu o WOD 3

Em **`/admin/wod/3`**:

1. numa dupla, digite o tempo **`14:32`** e deixe *Concluiu?* marcado
2. noutra, **desmarque** *Concluiu?*

> ✅ O campo de tempo trava e o **CAP de 20:00 é gravado sozinho**. O campo
> de volume abre para você registrar o que ela fez.
>
> Publique e repare: quem não concluiu fica **atrás** de quem concluiu,
> empatada com as outras incompletas e **marcada para decisão manual** —
> porque esse critério ainda não foi definido. Dá para mudar em
> `/admin/settings`.

---

### Ensaio 6 — Corrigir depois de publicar

O juiz vem correndo: "a Dupla 07 foi 8,75 km na bike, não 7,11".

1. **`/admin/wod/2`** → corrija o valor → **Salvar** → **Publicar**
2. vá em **`/admin/results`** e role até **Auditoria**

> ✅ Está registrado: *"alterou WOD 2 da Dupla 07: bike 7.110 → 8.750 km"*,
> com quem fez e a que horas.

---

### Ensaio 7 — Travar e destravar

1. em **`/admin/wod/1`** → **TRAVAR**
2. tente alterar uma carga e salvar → **o sistema recusa**
3. vá em **`/admin/results`** → **Destravar** → informe um motivo → corrija

> ✅ Resultado travado não muda por acidente, e o destravamento fica na
> auditoria com o motivo.
>
> Repare que **a classificação continua sendo recalculada**: se você travar o
> WOD 1 e depois publicar o WOD 3, as posições do WOD 1 se atualizam
> normalmente. Travar congela o que foi **lançado**, não o ranking.

---

### Ensaio 8 — Telão e QR Code

1. abra **`/display`** e aperte `F11`
2. do computador, publique mais um resultado

> ✅ O telão muda sozinho. Ninguém precisa ficar com o mouse na mão.

3. abra **`/qr`** → confira que o endereço **não** é `localhost` →
   **Baixar QR Code**
4. aponte a câmera do celular para a tela → tem que abrir o leaderboard

---

### Ensaio 9 — Duas pessoas ao mesmo tempo

Se mais alguém da organização vai lançar resultado, **teste agora**:

1. peça para essa pessoa entrar em `/login` no computador dela
2. lancem WODs diferentes ao mesmo tempo
3. confiram se o ranking bate nas duas telas

> ✅ Tem que bater. Os dois leem o mesmo cálculo — nenhuma das telas
> calcula por conta própria.

---

### Ensaio 10 — Exportar

Em **`/admin/results`**:

- **CSV** → abre no Excel com as colunas separadas e acentos corretos
- **JSON** → o mesmo, para quem for tratar os dados
- **Imprimir / PDF** → escolha *Salvar como PDF*, A4 paisagem

---

### Limpar o ensaio

Terminou? Volte ao ponto de partida:

**Supabase → SQL Editor → New query →** cole
**[`supabase/limpar-resultados.sql`](../supabase/limpar-resultados.sql) → RUN**

> Apaga **todos os resultados** e o histórico do ensaio.
> **Mantém** as 20 duplas com nomes e categorias, as configurações e os
> acessos de administrador. Ninguém precisa refazer cadastro nem perde
> o login.

---

## Nível 3 — Conferência da véspera

Com os dados **de verdade** já cadastrados:

- [ ] as **20 duplas** com o nome dos dois atletas — sem nenhum "a preencher"
- [ ] a **categoria** de cada uma conferida com a inscrição
- [ ] as **baterias** conferidas (quem corre na 1 e quem corre na 2)
- [ ] cada pessoa que vai lançar resultado **testou o próprio login**
- [ ] `/admin/settings` → **critério de desempate** decidido
- [ ] `/admin/settings` → **o que fazer com quem não concluir o WOD 3** decidido
- [ ] `/admin/settings` → **LIVE MODE** ligado
- [ ] **QR Code impresso** e testado com a câmera
- [ ] **`/display`** aberto no computador do telão, em tela cheia
- [ ] `/admin/results` → **nenhum resultado de ensaio sobrando** (se sobrou,
      rode o `limpar-resultados.sql`)
- [ ] teste o leaderboard **no 4G do celular**, não só no Wi-Fi do clube

---

## Se der ruim no dia

| Situação | O que fazer |
|---|---|
| Preciso tirar o site do ar por uns minutos | `/admin/settings` → **MAINTENANCE MODE** |
| O ranking está estranho | `/admin/results` → **Recalcular** |
| Publiquei errado | corrija e publique de novo — a auditoria registra |
| Travei sem querer | `/admin/results` → **Destravar** com o motivo |
| Uma dupla foi desclassificada | `/admin/teams` → status **Desclassificada** (sai do ranking, continua na lista) |
