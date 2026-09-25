# NAÇÃO | GESTÃO DE HORAS

> **A grade é fixa. O calendário muda. A gestão trabalha nas exceções. O sistema calcula o resto.**

Substitui as planilhas de escala e horas-aula dos professores da Nação Club:
grade semanal recorrente com vigência → competência (**26 → 25**) gerada
automaticamente → coordenadores registram só as exceções → fechamento
auditável por área → horas exportadas para a folha.

**MVP = horas.** Valores e custos entram na Fase 2. O DSR fica com a
contabilidade.

**Status:** ✅ E0 fundação · ✅ E1 login, permissões e auditoria · ✅ E2
cadastros · ✅ E3 grade com vigência + importação da planilha · ✅ E4
competência 26→25 e cálculo de horas. Próxima: E5 (exceções: falta,
substituição, cancelamento, aula avulsa, férias em lote).

### Implantação com a planilha atual

1. **Grade semanal → Importar planilha**: envie o .xlsx (Arquivo → Fazer
   download → Microsoft Excel). As abas de grade são reconhecidas sozinhas;
   as demais são ignoradas.
2. Na prévia, resolva os textos sem modalidade (ex.: "Boxe", "Core") e
   confira os nomes. Erros de digitação: "é a mesma pessoa que…".
3. Compare o quadro **horas por semana** com o PADRÃO da HORAS MENSAIS.
4. **Calendário → Gerar** a competência.

## Rodando em 3 minutos

Pré-requisitos: Node ≥ 20.11 e Docker (ou um PostgreSQL 16 já rodando).

```bash
cd horas
npm install
cp .env.example .env          # e troque SESSION_SECRET: openssl rand -hex 32
docker compose up -d --wait   # PostgreSQL local
npm run db:deploy             # aplica as migrations
npm run db:seed               # áreas, papéis e usuários de demonstração
npm run dev                   # http://localhost:3000
```

| Papel | E-mail | Senha (demo) |
|---|---|---|
| Administrador | `admin@nacaoclub.dev` | `nacao@2026` |
| Coordenação Nação Fit | `maria@nacaoclub.dev` | `nacao@2026` |
| Coordenação CrossFit | `juliana@nacaoclub.dev` | `nacao@2026` |
| Coordenação Aulas Coletivas | `rafa@nacaoclub.dev` | `nacao@2026` |
| Coordenação Futevôlei | `ramon@nacaoclub.dev` | `nacao@2026` |

O seed também cria a grade do briefing (Rafael, Eliseu, João) e gera
**Setembro/2026** (26/08–25/09), com o feriado de 07/09 decidido: HYROX
cancelada, CrossFit mantida.
| Consulta (DP / Financeiro) | `dp@nacaoclub.dev` | `nacao@2026` |

## Comandos

```bash
npm run check       # typecheck + testes (unitários e integração)
npm test            # só os testes
npm run build       # build de produção
npm run db:migrate  # nova migration (desenvolvimento)
npm run db:deploy   # aplica migrations (produção)
npm run db:seed     # dados de demonstração (bloqueado em produção)
```

Os testes de integração rodam contra um PostgreSQL de verdade
(`TEST_DATABASE_URL`). Cada execução cria um **schema efêmero**, aplica as
migrations reais e remove o schema no fim. O banco de desenvolvimento nunca
é tocado. Sem `TEST_DATABASE_URL`, só os testes unitários rodam.

## Estrutura

```
horas/
├── prisma/            schema, migrations (com SQL de triggers) e seed
├── src/
│   ├── app/           telas (App Router) e Server Actions
│   ├── components/    design system Nação + casca do app
│   ├── lib/           env, formatação (minutos → "1h30")
│   └── server/
│       ├── auth/      senha, sessão, permissões, escopo por área
│       ├── services/  casos de uso (autoriza → valida → grava → audita)
│       └── audit.ts   trilha de auditoria na mesma transação
└── tests/             unit/ (puro) · integration/ (Postgres real)
```

## Colocar no ar

👉 **[docs/colocar-no-ar.md](docs/colocar-no-ar.md)** — Supabase + Vercel, ~30 min, sem instalar nada.

## Documentação

| # | Documento | Cobre |
|---|---|---|
| 01 | [Produto e arquitetura](docs/01-produto-e-arquitetura.md) | Arquitetura geral, stack, camadas, **permissões**, integrações, segurança |
| 02 | [Banco de dados](docs/02-banco-de-dados.md) | Modelo, **relacionamentos** (ER), vigências, índices, constraints |
| 03 | [Regras de negócio](docs/03-regras-de-negocio.md) | Geração do mês, **exceções**, cálculo de horas, **fechamento**, motor financeiro, mês demo com resultado esperado |
| 04 | [Telas, fluxos e UX](docs/04-telas-fluxos-ux.md) | **Mapa de telas**, **fluxos por perfil**, UX desktop/mobile, identidade visual |
| 05 | [Plano de implementação](docs/05-plano-de-implementacao.md) | **MVP × Fase 2**, etapas E0–E8, testes, decisões e perguntas em aberto |
| 06 | [Diagnóstico da planilha](docs/06-diagnostico-da-planilha.md) | Como a planilha calcula hoje, os 4 layouts, pontos frágeis e plano de migração |
