# Montar um evento novo

O Nação Híbrida é uma plataforma, não o app de uma etapa só. Cada etapa é um
**evento** independente, com as próprias duplas e os próprios resultados — e
uma etapa nova pode nascer **copiando as regras** da anterior.

O caminho mais curto: `/admin/eventos` → **Novo evento** → escolha de qual
copiar as regras. Pronto, o regulamento inteiro vem junto e você só cadastra
as inscrições.

---

## 0. O ciclo de uma etapa

| Estado | O que significa |
|---|---|
| **Em montagem** | existe, você está cadastrando. O público não vê |
| **No ar** | é o que aparece no leaderboard público. **Só um por vez** |
| **Arquivado** | saiu do ar. Continua inteiro e consultável — nada é apagado |

Três ideias que é fácil confundir:

- **No ar** é o que o público vê.
- **Em edição** é o que *você* está mexendo. Pode ser outro: montar março
  enquanto setembro ainda roda é o caso normal. A faixa no topo de
  `/admin/eventos` avisa quando os dois são diferentes.
- **Arquivar não apaga.** Os resultados de setembro ficam em
  `/leaderboard?evento=<endereço>` para sempre.

### Criar a etapa copiando a anterior

`/admin/eventos` → **Novo evento**

| Campo | Para que serve |
|---|---|
| **Nome** | aparece no cabeçalho e na súmula |
| **Endereço** | vira o link (`/leaderboard?evento=nacao-hibrida-marco`) |
| **Data** | dia da competição |
| **Copiar as regras de** | de qual evento herdar o regulamento |

**O que é copiado:** configurações (critérios de desempate, política de CAP,
número de baterias), WODs, prescrição em blocos, provas e a programação do dia.

**O que NÃO é copiado:** duplas, homologações e lançamentos. A etapa nasce
limpa — com o regulamento pronto e nenhum resultado contaminando a
classificação.

Depois: cadastre as duplas em `/admin/teams`, ajuste o que mudou nos WODs, e
clique em **Colocar no ar** quando for a hora. O evento anterior é arquivado
sozinho, na mesma operação.

---

## 1. Os workouts

`/admin/wods` → **Novo WOD**

| Campo | Para que serve |
|---|---|
| **Número** | define a ordem e o prefixo dos códigos das provas (WOD 2 → 2A, 2B…) |
| **Nome** | STRENGTH, ENDURANCE, METCON… |
| **Formato** | texto livre: `AMRAP 22'`, `FOR TIME`, `CARGA MÁXIMA` |
| **CAP** | em minutos. Vazio = workout sem tempo limite |
| **Resumo** | uma ou duas frases, exibidas na página pública do WOD |
| **A dupla pode não concluir** | marque em workout com tempo limite onde dá para estourar o CAP |
| **Regras de execução** | uma por linha |
| **Regras ainda não definidas** | uma por linha. Aparecem declaradas, não escondidas (§48) |
| **Prescrição em blocos** | os movimentos, na ordem, com carga masculina e feminina |

### “A dupla pode não concluir”

É o que liga o campo **concluiu** e o **volume parcial** no lançamento. Também
é o que faz a *política de incompletos* (Configurações) valer para as provas
daquele workout. Em workout de carga ou distância, deixe desmarcado.

---

## 2. As provas

Uma prova é **uma coisa que gera ranking e pontos**. Um WOD pode ter uma ou
dez.

| Campo | O que decide |
|---|---|
| **Código** | o que aparece na coluna da tabela: `1A`, `2C`, `3A` |
| **Descrição** | o nome por extenso |
| **Critério** | texto exibido na página do WOD |
| **Unidade** | kg · km · metros · tempo (mm:ss) · repetições · calorias |
| **Quem vence** | maior resultado ou menor resultado |
| **De onde vem o número** | lançada pelo juiz, ou calculada |
| **Lançada por atleta** | o juiz digita dois campos e a prova vale a soma |
| **Soma no total** | desmarque para uma prova ranqueada mas fora do total |

### Prova calculada

Escolha **Calculada — soma de outras provas** e marque quais. É assim que a
`1D` existe: ela é `1A + 1B + 1C`, e **nunca é digitada**. Isso é o que
impede o total de divergir das parcelas por um erro de digitação.

Só provas **lançadas pelo juiz** podem entrar numa soma. O sistema recusa
somar uma prova que já é uma soma — conta de conta faria o app e o banco
discordarem.

---

## 3. A programação

Na mesma tela, abaixo dos WODs. Cada linha é um momento do dia:

- um momento **ligado a um WOD e a uma bateria** vira o horário daquela
  bateria, e é o que o atleta vê na página da dupla dele;
- os outros — briefing, conferência, pódio — ficam soltos.

As setas reordenam. O número de baterias fica em **Configurações**.

---

## 4. Os critérios

`/admin/settings`

- **Empate numérico**: posição repetida (1º, 1º, 3º) ou média das posições.
- **Quem não concluiu dentro do CAP**: decisão manual, maior volume na
  frente, ou todos na última posição.
- **Critérios de desempate**: até três, aplicados em ordem. A lista de
  opções é montada a partir dos WODs que você cadastrou.
- **Baterias**: quantas o evento tem.

---

## O que o sistema continua se recusando a fazer

Nada aqui inventa regra. Se a organização não definir o critério de
desempate, duplas empatadas dividem a posição e a tela mostra **EMPATE**. Se
não definir como ordenar quem estourou o CAP, os incompletos ficam empatados
entre si e sinalizados. As regras pendentes aparecem **declaradas** na página
do WOD.

É deliberado: um placar que chuta é pior do que um placar que pergunta.

---

## A súmula do árbitro

`/admin/wod/<número>` → **Súmula do árbitro**, ou direto em
`/admin/wod/<número>/sumula`.

Uma folha **por bateria**, com a prescrição do workout impressa, as duplas
daquela bateria, os nomes dos atletas e um campo por prova.

Serve a dois momentos, e é o mesmo documento nos dois:

- **Na prancheta** — imprima antes da bateria. Os campos saem vazios, o juiz
  escreve à mão à beira do equipamento, onde não há tablet nem sinal.
- **Na tela** — os mesmos campos são editáveis e salvam direto na plataforma,
  em **Salvar na plataforma**.

Se já houver resultado lançado, ele aparece nos campos. Então a folha impressa
*depois* do lançamento vira documento de conferência: o juiz confere, a dupla
assina de acordo, e aquilo encerra a discussão.

No seletor, **Todas as baterias** imprime um bloco por bateria, uma folha
cada — para distribuir entre os juízes de uma vez.

---

## Quem pode administrar

`/admin/equipe`

A organização **autoriza um e-mail**. A pessoa abre `/login`, clica em
**Primeiro acesso — criar minha senha** e escolhe a senha dela.

Por que assim: criar a conta de outra pessoa exigiria guardar a chave mestra
do banco na Vercel — uma chave que dá poder total sobre tudo. Trocar isso por
economizar um passo de cadastro seria péssimo negócio (§35). E ninguém precisa
digitar a senha de ninguém.

A coluna de selo mostra em que pé está cada um:

| Selo | O que significa |
|---|---|
| **Acesso ativo** | já criou a conta e consegue entrar |
| **Aguardando 1º acesso** | autorizado, mas ainda não criou a senha |

Se alguém diz que não consegue entrar, olhe aqui primeiro — e confira se o
e-mail autorizado é **exatamente** o que a pessoa está digitando.

> Criar conta sozinho não dá acesso a nada. Quem decide é o e-mail autorizado,
> verificado no Postgres a cada gravação. Uma conta de alguém de fora enxerga
> o mesmo que o público já enxerga.
