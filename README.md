# NAÇÃO | QUEM CHEGOU?

> **Conheça. Conecte. Cuide.**
> Camada de inteligência de relacionamento do Nação Club.

Quando um aluno passa pela catraca, o professor precisa saber, em segundos:
**quem chegou e o que fazer para atendê-lo melhor.**

Este sistema **não substitui o Tecnofit**. O Tecnofit continua sendo a fonte
oficial dos dados transacionais. Isto aqui é a camada que faltava: a
**memória operacional do relacionamento** entre a Nação e seus alunos.

```
ALUNO PASSA NA CATRACA
        ↓
sistema identifica → busca contexto → apresenta ao professor
        ↓
professor atende melhor → registra o que aprendeu
        ↓
próximo atendimento começa mais rico
```

---

## Começando em 3 minutos

### Pré-requisitos
Node ≥ 20.11 e Docker (ou um PostgreSQL 16 já rodando).

```bash
npm install
npm run setup     # cria o .env, gera o segredo, sobe o banco, migra e semeia
npm run dev       # http://localhost:3000
```

O `setup` é idempotente — pode rodar quantas vezes quiser. Um `.env` que já
exista é preservado; ele só completa o que falta.

### Deu algum problema?

```bash
npm run doctor
```

Verifica Node, Docker, dependências, `.env`, conexão com o banco, migrations,
seed e a porta 3000 — e, para cada falha, imprime o comando exato que resolve.

| Papel | E-mail | Senha |
|---|---|---|
| ADMIN | `admin@nacaoclub.dev` | `nacao@2026` |
| GESTOR | `gestor@nacaoclub.dev` | `nacao@2026` |
| PROFESSOR | `professor@nacaoclub.dev` | `nacao@2026` |

> Entre como **PROFESSOR** para ver o controle de permissão em ação: ele
> enxerga apenas 2 das 6 catracas.

---

## ⚠️ Leia antes de ligar em produção

A documentação oficial da API Tecnofit **foi localizada mas não pôde ser
consultada** no ambiente de desenvolvimento (bloqueio de rede). Por isso:

- **nenhum endpoint foi inventado** — os paths estão vazios por padrão e o
  cliente HTTP recusa a chamada com erro explícito;
- **nenhum campo foi assumido** — o mapeamento é declarativo e aceita
  múltiplos candidatos por campo;
- **toda limitação está documentada** em
  [`docs/tecnofit-integration.md`](docs/tecnofit-integration.md).

Ligar a API real são **3 passos de configuração**, sem mudança de lógica.
O documento acima traz o passo a passo e a lista de perguntas prontas para
abrir um chamado com a Tecnofit.

---

## O que está pronto

| # | Entrega do MVP | |
|---|---|---|
| 1 | Login com sessão revogável | ✅ |
| 2 | Integração Tecnofit (adapter + mock + probe) | ✅ |
| 3 | Identificação de alunos | ✅ |
| 4 | Identificação de catracas (descoberta pela API) | ✅ |
| 5 | Seleção de catraca | ✅ |
| 6 | Catraca padrão por usuário | ✅ |
| 7 | Permissões por catraca (no backend) | ✅ |
| 8 | Eventos em tempo quase real (SSE + polling + webhook) | ✅ |
| 9 | Dashboard "Quem Chegou?" | ✅ |
| 10 | Card do aluno | ✅ |
| 11 | Perfil do aluno | ✅ |
| 12 | Histórico de acessos | ✅ |
| 13 | Frequência | ✅ |
| 14 | Modalidades | ✅ |
| 15 | Notas de relacionamento | ✅ |
| 16 | Feedback rápido (1 clique) | ✅ |
| 17 | Alertas (7 regras determinísticas) | ✅ |
| 18 | Auditoria com valor anterior e novo | ✅ |
| 19 | Segurança (authn, authz, LGPD, redação de segredos) | ✅ |
| 20 | Logs estruturados | ✅ |

**67 testes** cobrindo deduplicação, normalização, regras de alerta, hash de
senha e redação de segredos.

---

## Stack

**Next.js 15** (App Router) · **TypeScript** estrito · **PostgreSQL 16** +
**Prisma** · **Tailwind v4** · **SSE** · sessão em banco com **scrypt**

Escolhas e trade-offs em [`docs/architecture.md`](docs/architecture.md).

---

## Comandos

```bash
npm run dev              # desenvolvimento
npm run build            # build de produção
npm test                 # 67 testes
npm run typecheck        # TypeScript estrito
npm run db:migrate       # migrations (dev)
npm run db:deploy        # migrations (produção)
npm run db:seed          # dados fictícios
npm run db:studio        # inspeção do banco
npm run tecnofit:probe   # valida a integração sem gravar nada
```

---

## Estrutura

```
src/
├── app/                       Páginas e rotas de API
│   ├── login/                 Tela de login
│   ├── dashboard/             QUEM CHEGOU?
│   ├── alunos/[id]/           Perfil do aluno
│   └── api/                   Endpoints (todos com withAuth)
├── components/                Avatar, Logo, Busca, Modal, Feedback
├── server/
│   ├── auth/                  senha, sessão, RBAC
│   ├── db/                    cliente Prisma
│   ├── realtime/              barramento de eventos
│   ├── services/              regra de negócio
│   └── tecnofit/              ⭐ Anti-Corruption Layer
│       ├── endpoint-map.ts    ⭐ TODA a incerteza da API mora aqui
│       ├── normalizer.ts      tradução guiada pelo mapa
│       ├── http-provider.ts   API real
│       └── mock-provider.ts   desenvolvimento
├── lib/                       env, logger, formatação
└── styles/                    design system Nação Club
```

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [`architecture.md`](docs/architecture.md) | Camadas, fluxo, deduplicação, realtime, alertas |
| [`tecnofit-integration.md`](docs/tecnofit-integration.md) | **O que sabemos, o que não sabemos e como ligar** |
| [`database.md`](docs/database.md) | Schema, índices e por que cada um existe |
| [`security.md`](docs/security.md) | Autenticação, autorização, LGPD, limitações |
| [`deployment.md`](docs/deployment.md) | Local, homologação, produção, escala, rollback |

---

## Identidade visual

Paleta oficial do Manual da Marca Nação Club:

`#022B57` navy · `#0169E9` azul Nação · `#3A86FF` azul claro ·
`#20C4FA` ciano · `#FFFFFF` branco

**Tipografia:** Gotham (títulos) e Gotham Rounded Light (corpo). Como são
fontes licenciadas e não redistribuíveis, o sistema as usa quando instaladas
e cai em Montserrat / Nunito — as substitutas mais próximas em geometria.

**Logotipo:** o arquivo oficial deve ser adicionado pela equipe da Nação em
`/public/logo-nacao.svg`. Até lá, uma assinatura tipográfica respeita paleta
e proporção do manual.

---

## Regra de ouro

```
PESSOA → CONTEXTO → RELACIONAMENTO → EXPERIÊNCIA
```

e nunca

```
CATRACA → LOG → BANCO DE DADOS
```

A catraca é apenas o gatilho. **O produto é relacionamento.**
