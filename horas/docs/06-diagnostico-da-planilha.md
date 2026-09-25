# 06 · Diagnóstico da planilha atual

Fonte: *Horário Professor Nação Club* (Google Sheets), abas **CROSSFIT 2026**,
**NAÇÃO FIT 2026**, **QUADRAS DE AREIA 2026**, **CONTRATURNO 2025** e
**HORAS MENSAIS**. As abas com dados pessoais e salários (INFO COLABORADOR,
FOLHA, SALÁRIOS) **não** foram usadas, e nenhum dado real vai para o
repositório: o seed continua fictício.

---

## 1. Como a planilha calcula hoje

```
Abas de grade (1 célula = 1 aula = 1 hora)
        │  COUNTIF("Nome", coluna do dia)          ← PADRÃO semanal
        ▼
HORAS MENSAIS  ×  qtde de Seg/Ter/…/Dom do período ← digitada à mão ("EDITAR APENAS AQUI")
        │
        +  Sábado (número fixo digitado)
        +  Evento Extra  (reunião, curso, evento)
        +  Substituições (número digitado)
        −  Faltas        (número digitado)
        =  Horas total   + Observação em texto livre
```

O período já é **26 do mês anterior → 25 do mês**: "Quantidade de Aula …
26/08 até 25/09".

## 2. Os três formatos de grade

| Aba | Layout | Como o importador vai ler |
|---|---|---|
| **CROSSFIT 2026** | Bloco por horário (`5h`, `5h30`, `6h`…) × linha por sala (`CROSSFIT 1`, `FUNCIONAL 1`, `SALA TATAME`, `AREIA`) × coluna por dia. A célula traz só o **nome**, e aí a modalidade vem da sala, ou traz a **modalidade** com o nome na linha de baixo (`Hyrox` / `Nome`). Linhas `AUXILIAR`/`ESTAGIÁRIOS` listam quem acompanha | Parser de blocos: sala → modalidade padrão; par modalidade+nome; auxiliares viram professores extras da mesma aula |
| **QUADRAS DE AREIA 2026** | Horário × quadra × dia. Célula no formato `TURMA - PROFESSOR` (`SÉRIE D - …`, `APRENDIZ - …`, `BASE FORTE FTV - …`) | Separa pelo ` - `: turma vira o rótulo da aula e o professor é o nome. Célula sem professor (`SÉRIE C`) vira aula **sem professor** |
| **NAÇÃO FIT 2026** | **Plantão**, não aula: faixas de 1h (`5h - 6h`…) com PROFESSOR e ESTAGIÁRIO, iguais de segunda a sexta. Fim de semana é escala **por data** (Data · Dia e Horário · Professor · Estagiário) | Faixa de seg–sex vira uma atividade recorrente em 5 dias. Fim de semana vira atividades avulsas por data |
| **CONTRATURNO 2025** | Horário × modalidade (Natação, Funcional Kids, Judô, Jiu-Jitsu, Futebol, Futevôlei, Vôlei) × dia | Igual ao CrossFit, sem pares |

## 3. Pontos frágeis encontrados (o sistema elimina por construção)

Nada aqui é crítica a quem monta a planilha. É o limite natural de
calcular folha com `COUNTIF`. Vale conferir cada item: alguns podem ser
intencionais.

| # | Onde | O que acontece | Como o sistema resolve |
|---|---|---|---|
| 1 | HORAS MENSAIS `E59` | A contagem de quinta de um professor procura o nome de **outro professor** | O professor é um cadastro (ID), não um texto digitado |
| 2 | HORAS MENSAIS `H49` | O domingo procura uma grafia do nome (`Y…`), e os outros dias procuram outra (`I…`) | Apelidos (`teacher_aliases`) só na importação; depois disso é sempre ID |
| 3 | CROSSFIT `C40`/`E40` | Nome digitado com letra duplicada: a aula **não é contada** para ninguém | O importador acusa nome desconhecido no preview e não deixa passar |
| 4 | QUADRAS `C13`, `C14`… | `PERSONAL` + nome abreviado não casa com o curinga `*NOME*` da fórmula e fica fora da conta | Tipo de atividade "Personal" com regra explícita: conta ou não conta |
| 5 | HORAS MENSAIS `B14`, `D14`, `B26`, `D26`, `F26` | `=SUM(...)-1`: correções manuais escondidas na fórmula | Toda correção é uma exceção com motivo, autor e data |
| 6 | HORAS MENSAIS linha 99–105 | Quantidade de cada dia da semana digitada à mão por período | Calculada a partir do calendário real |
| 7 | Período 26/08–25/09 | O feriado de **07/09** (segunda) entra como segunda normal, e "observações feriados" está vazio | Feriado cadastrado com política cancelar/manter/decidir |
| 8 | CROSSFIT `Mobilidade` | Cada célula vale **1h**, mas Mobilidade é aula de **30 min** | A duração é da aula (em minutos), não da célula |
| 9 | NAÇÃO FIT `B54:F63` | `COUNTIF` na faixa inteira `$B$3:$H$25` para todo dia da semana: supõe seg=ter=…=sex e mistura professor com estagiário quando a faixa vai até `I` (`B58`) | A grade é por dia e por papel |
| 10 | HORAS MENSAIS `K17` e `K34` | O mesmo professor aparece em duas linhas de total | Um professor, um extrato |
| 11 | Coluna Sábado / Evento Extra / Substituições / Faltas | Números digitados, com o motivo só no texto da observação ("faltou 12.08 de manhã", "+2h reunião") | Cada ocorrência é um registro datado. A observação vira histórico consultável |
| 12 | Cabeçalhos "2025 - JUL", "FEVEREIRO" | Não dá para saber a partir de quando a grade vale | Versões de grade com vigência |

## 4. O que a planilha ensinou sobre o modelo

1. **Nem tudo é aula.** Existem **plantão** (Nação Fit), **coordenação**
   (horas fixas por dia), **reunião/curso/evento** (que a planilha soma em
   "Evento Extra") e **personal**. O modelo passa a ter *tipo de atividade*,
   cada tipo com a regra "conta hora: sim/não".
2. **Aula com mais de uma pessoa é rotina** (auxiliar/estagiário no
   CrossFit, professor + estagiário no plantão). Cada pessoa recebe a hora
   cheia.
3. **Turma é rótulo, não modalidade** (`SÉRIE A`, `APRENDIZ`,
   `SIMULAÇÃO DE JOGO`). A modalidade é Futevôlei, e a turma aparece no card.
4. **Grade de fim de semana é por data**, não recorrente: o sistema precisa
   facilitar lançar atividade em várias datas de uma vez.
5. **Mudança de horário no meio do período é comum** ("horário novo hyrox
   iniciado 17.08"). É exatamente o "alterar grade a partir desta data".

## 5. Plano de migração

1. Importar a grade vigente de cada aba (com preview e apelidos).
2. Comparar o **PADRÃO semanal** calculado pelo sistema com as colunas
   `B:H` de HORAS MENSAIS, professor a professor. Toda diferença é
   explicada (item da §3) ou corrigida antes de seguir.
3. **Rodada em paralelo** em uma competência (ex.: 26/10–25/11): planilha e
   sistema juntos, com um relatório de diferenças no fechamento.
4. Desligar a planilha.
