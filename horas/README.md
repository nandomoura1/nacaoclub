# NAÇÃO | GESTÃO DE HORAS

> **A grade é fixa. O calendário muda. A gestão trabalha nas exceções. O sistema calcula o resto.**

Substitui as planilhas de escala e horas-aula dos professores da Nação Club:
grade semanal recorrente com vigência → competência (**26 → 25**) gerada
automaticamente → coordenadores registram só as exceções → fechamento
auditável por área → horas exportadas para a folha.

**MVP = horas.** Valores e custos entram na Fase 2. O DSR fica com a
contabilidade.

**Status:** arquitetura e plano em revisão — o código começa pela
Etapa E0.

## Documentação

| # | Documento | Cobre |
|---|---|---|
| 01 | [Produto e arquitetura](docs/01-produto-e-arquitetura.md) | Arquitetura geral, stack, camadas, **permissões**, integrações, segurança |
| 02 | [Banco de dados](docs/02-banco-de-dados.md) | Modelo, **relacionamentos** (ER), vigências, índices, constraints |
| 03 | [Regras de negócio](docs/03-regras-de-negocio.md) | Geração do mês, **exceções**, cálculo de horas, **fechamento**, motor financeiro, mês demo com resultado esperado |
| 04 | [Telas, fluxos e UX](docs/04-telas-fluxos-ux.md) | **Mapa de telas**, **fluxos por perfil**, UX desktop/mobile, identidade visual |
| 05 | [Plano de implementação](docs/05-plano-de-implementacao.md) | **MVP × Fase 2**, etapas E0–E8, testes, decisões e perguntas em aberto |
| 06 | [Diagnóstico da planilha](docs/06-diagnostico-da-planilha.md) | Como a planilha calcula hoje, os 4 layouts, pontos frágeis e plano de migração |
