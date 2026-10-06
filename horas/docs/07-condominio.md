# Condomínio Nação (Aba 3)

Rateio mensal dos gastos comuns do espaço e cobrança dos parceiros. Substitui a
planilha "Condomínio Nação Club" (abas ENERGIA, IPTU e uma aba por mês).

## Fluxo do mês

1. **Abrir a competência** (o mês vencido: em outubro cobra-se setembro, vencimento dia 20/10).
   Copia a anterior: despesas fixas confirmadas, variáveis "a confirmar", alunos,
   itens fixos (com a quantidade anterior), tarifa e bandeira. Mostra quem entrou e saiu.
2. **Despesas** (Tabela 1) por grupo, com memória de cálculo opcional.
3. **Energia**: leitura acumulada de cada relógio; troca de relógio, leitura estimada e
   alerta de ±50% da média dos 3 meses anteriores.
4. **Rateio** (Tabela 2): Lanchonete com % fixo (30%); o resto por nº de alunos/colaboradores.
5. **Cobranças** (Tabela 3): energia + condomínio + IPTU + itens fixos + avulsos.
6. **Fechar**: congela o resultado (snapshot), gera as cobranças (nº sequencial),
   o PDF A4 com PIX "copia e cola" e o texto de WhatsApp. Reabrir exige `condo.close`.

## Regras (src/domain/condominio)

- Energia: `consumo × tarifa × fator da bandeira` (0,9564346 × 1,15 desde 2024).
- IPTU: `IPTU do ano × área / área total / nº de parcelas × % do parceiro`
  (2026: 6 parcelas de maio a outubro; Society paga 50%). Área comum fica com a Nação.
- Rateio: cada cota arredondada sozinha; a sobra de centavos vai para a Lanchonete.
  Percentual = valor ÷ total.
- Entrada/saída no meio do mês: proporcional aos dias (condomínio, IPTU e itens fixos);
  energia e avulsos inteiros. Também dá para cobrar o mês cheio ou não cobrar.
- Dinheiro em centavos; arredondamento meio-para-cima só no fim de cada linha.

## Decisões sobre a planilha (divergências encontradas)

- O "Percentual" da Tabela 2 dividia alunos por Σalunos × 1,667 (e a Lanchonete tinha 40% digitado):
  não batia com o dinheiro. O sistema usa valor ÷ total.
- IPTU da Nação Beauty apontava para a linha da Tríade (mesmo valor por coincidência).
- 2025: o IPTU entrava só na fórmula do total (`=SUM(...)+IPTU!F5`), sem linha — a importação cria a linha.
- Jun/26: energia do Society apontava para a leitura de maio (`ENERGIA!M30`); Out/25: Recovery para `E22`.
- Leituras do Society em jul/ago de 2026 eram estimadas por fórmula: marcadas como estimadas.
- Competências importadas ficam como foram cobradas (não recalculadas). Meses antes do último
  importado entram como pagos (presumido); o último fica pendente para conferência.

## Importação

Cadastros → Importar planilha (.xlsx), uma vez, com o Condomínio vazio. O sistema
recalcula o último mês e mostra a conferência com o que foi cobrado.
Valores reais (inclui salários) nunca vão para o repositório: testes usam números fictícios.
