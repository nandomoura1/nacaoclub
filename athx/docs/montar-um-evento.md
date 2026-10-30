# Montar um evento novo

O Nação ATHX deixou de ser um app de uma etapa só. Os workouts, as provas, a
programação e o número de baterias são **dados cadastrados**, não código — a
organização monta a próxima etapa em `/admin/wods`, sem deploy e sem
programador.

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
