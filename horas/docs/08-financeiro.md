# Financeiro · Relatório Financeiro

Base histórica financeira e gerencial da Nação Club: todo mês os documentos entram, o sistema lê, uma pessoa confere, a competência é aprovada (versão congelada) e o relatório executivo sai com indicadores do motor e textos da IA.

## Fluxo

```
Painel → Novo relatório (mês) → Documentos (8 cards) → leitura pela IA
      → Conferência (Confirmar · Editar · Origem) → Aprovar (versão N)
      → Relatório (completo ou Visão dos sócios) → Imprimir/PDF
```

- **Motor ≠ IA.** `src/domain/financeiro/metrics.ts` calcula tudo (puro e testado). A IA só extrai linhas com origem (`src/server/financeiro/extract.ts`) e escreve a análise a partir dos indicadores prontos (`analysis.ts`). Nunca altera números.
- **Dado ausente** aparece como "Dado não informado" — nunca é copiado do mês anterior.
- **Versões.** Aprovar congela linhas, métricas, documentos, observações e análise em `fin_versions`. Editar depois exige motivo e volta a competência para conferência; painel e histórico seguem na última versão aprovada.
- **Importar relatórios antigos.** Upload → "Encontramos os seguintes dados" (editável) → confirmar. Mês existente: Comparar · Criar nova versão · Atualizar dados (vai para conferência) · Cancelar. Indicadores prontos entram como dataset `INDICADOR` e só valem quando o mês não tem linhas de detalhe.

## Regras críticas (testadas)

Aporte/empréstimo não é receita operacional · pessoal econômico sem IRRF, adiantamento, payout e parceria do Tênis · Tênis = repasse de parceria (% configurável) · Ticket Funcionário não é receita comercial · Conta Assinada só é venda quando COMERCIAL · CMV real com inventário, senão ESTIMADO por compras · payout nunca é OPEX · fluxo ≠ lucro · caixa disponível ≠ a receber · base de alunos = matrículas, não clientes únicos.

## Permissões

`fin.view` (ver) · `fin.import` (enviar/ler documentos, importar) · `fin.edit` (conferir, corrigir, observações, análise) · `fin.approve` (aprovar versões, gravar importação aprovada) · `fin.export` · `fin.admin` (metas e categorias). Admin recebe todas.

## Limites do MVP

- Até 6 MB por arquivo (limite das Server Actions). XLS antigo: salvar como XLSX.
- Exportação: impressão/PDF pelo navegador. Exportar Excel fica para depois.
- Investimentos e financiamentos entram como dados do relatório, sem telas próprias de controle.
- Textos da IA dependem da `ANTHROPIC_API_KEY` no ambiente; em desenvolvimento, `AI_FAKE=1` usa exemplos.
