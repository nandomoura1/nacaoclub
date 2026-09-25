# NAÇÃO | GESTÃO DE HORAS

> **A grade é fixa. O calendário muda. A gestão trabalha nas exceções. O sistema calcula o resto.**

Substitui as planilhas de escala e horas-aula dos professores da Nação Club:
grade semanal recorrente com vigência → calendário do mês gerado
automaticamente → coordenadores registram só as exceções → fechamento
auditável por área → exportação para a folha.

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
