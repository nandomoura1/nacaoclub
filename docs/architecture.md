# Arquitetura — NAÇÃO | QUEM CHEGOU?

## 1. A ideia em uma frase

A catraca é o **gatilho**. O produto é o **relacionamento**.

Este sistema não substitui o Tecnofit. Ele é uma camada de inteligência que
transforma um evento operacional ("alguém girou a catraca") em uma
oportunidade de atendimento ("sei quem chegou e como cuidar melhor dele").

## 2. Regra fundamental

> **O Tecnofit é a fonte oficial dos dados transacionais.**

O banco local guarda **apenas**:

- usuários, papéis e permissões do sistema;
- catracas e suas autorizações;
- eventos de acesso **normalizados** (para performance e histórico);
- **notas e eventos de relacionamento** — o dado que só existe aqui;
- alertas, auditoria e cache.

Não replicamos financeiro, CPF, endereço ou contrato. Princípio da
minimização (ver `docs/security.md`).

## 3. Camadas

```
┌─────────────────────────────────────────────────────────┐
│ FRONTEND (React / Next App Router)                      │
│ Dashboard · Perfil · Busca · Notas · Feedback           │
│                                                         │
│ ⚠ NUNCA fala com a API Tecnofit. Só com /api/*.         │
└───────────────────────┬─────────────────────────────────┘
                        │ fetch + EventSource (SSE)
┌───────────────────────▼─────────────────────────────────┐
│ ROTAS DE API  (src/app/api)                             │
│ withAuth() envolve TODAS: sem rota acidentalmente pública│
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│ SERVICES (src/server/services)                          │
│ Access · Student · Turnstile · Relationship             │
│ Alert · Ingest · Poller · Audit                         │
│                                                         │
│ Aqui vive a REGRA DE NEGÓCIO e a AUTORIZAÇÃO.           │
└──────────┬────────────────────────────┬─────────────────┘
           │                            │
┌──────────▼──────────┐    ┌────────────▼──────────────────┐
│ PRISMA / PostgreSQL │    │ TECNOFIT ADAPTER              │
│                     │    │ provider · normalizer · map   │
└─────────────────────┘    └───────────────────────────────┘
```

**Regra de dependência:** as setas apontam para dentro. Um service pode usar
o adapter; o adapter nunca conhece um service. A UI nunca conhece o adapter.

## 4. Fluxo completo de uma chegada

```
 1. Aluno gira a catraca
 2. Evento chega  ── webhook (push)  ou  poller (pull)
 3. Normalizer traduz o payload cru para o tipo de domínio
 4. IngestService:
      a. calcula dedupeKey
      b. checagem barata de duplicata
      c. resolve o aluno (cache local de 15 min, ou API)
      d. resolve a catraca (por ID, depois por nome)
      e. persiste  ← índice único é a garantia real contra corrida
      f. atualiza firstSeenAt / lastSeenAt
      g. AlertService avalia as regras
      h. publica no barramento realtime
 5. SSE entrega ao dashboard — filtrado por catraca NO SERVIDOR
 6. O dashboard recarrega o feed (contexto já montado)
 7. Professor vê nome, plano, frequência e a última observação
 8. Professor atende
 9. Professor registra (1 clique ou 1 nota)
10. Próximo atendimento começa mais rico
```

## 5. Deduplicação

O mesmo giro de catraca **não pode** virar dois cards. Isso acontece o tempo
todo na prática: o webhook entrega e o poller relê a mesma janela.

**Duas camadas:**

1. **`external_event_id`** — quando a origem fornece ID único, ele manda.
   Índice único no banco.

2. **`dedupe_key`** — sempre calculada, mesmo quando há ID externo. É a rede
   de segurança para quando webhook e poller descrevem o mesmo evento com
   IDs diferentes (ou sem ID nenhum).

```
dedupe_key = sha256(aluno | catraca | tipo | timestamp_em_segundos)[:40]
```

**Decisões e o porquê:**

| Decisão | Razão |
|---|---|
| Truncar ao **segundo** | Milissegundos divergem entre origens para o mesmo evento físico. O minuto engoliria duas entradas legítimas seguidas. |
| Catraca por **ID, senão rótulo normalizado** | "Catraca Futevôlei" e "CATRACA FUTEVOLEI" são a mesma catraca. Acentos e caixa não podem gerar duplicata. |
| Marcador `unknown` explícito | Um evento sem catraca identificada **não pode** colidir silenciosamente com um de catraca conhecida. |
| Índice único no banco | A checagem antes do insert é otimização. A **garantia** é o `P2002` tratado no `catch`. |

Coberto por 12 testes em `tests/dedupe.test.ts` e verificado em execução real:
102 eventos ingeridos, **0 duplicatas**, com o log registrando
`received: 2, persisted: 1, duplicates: 1` no ciclo sobreposto.

## 6. Realtime: por que SSE e não WebSocket

O fluxo é **100% servidor → cliente**. O dashboard só recebe.

| | SSE | WebSocket |
|---|---|---|
| Reconexão automática | ✅ nativa | ❌ manual |
| Atravessa proxy HTTP | ✅ sem upgrade | ⚠️ exige configuração |
| Complexidade operacional | baixa | média |
| Bidirecional | ❌ | ✅ (não precisamos) |

O contrato do `event-bus` (`publish` / `subscribe`) isola o transporte. Se um
dia houver interação bidirecional, troca-se a camada sem tocar nos services.

**Filtro de catraca acontece no servidor.** Um professor conectado à catraca
do Futevôlei **não recebe o byte** de uma entrada do Tênis. Não é a UI que
esconde — é o servidor que não envia.

> **Limitação conhecida:** o barramento é **em processo**. Com múltiplas
> instâncias, um evento ingerido na instância A não chega ao SSE da B.
> Troca prevista: Postgres `LISTEN/NOTIFY` ou Redis pub/sub.
> Ver `docs/deployment.md`.

## 7. Motor de alertas

Regras **determinísticas e auditáveis**. Sem IA no MVP — se o professor não
consegue explicar por que o alerta apareceu, o alerta perde a confiança dele
e vira ruído.

Cada regra é uma **função pura** `AlertContext → AlertDraft | null`.
Adicionar uma regra é acrescentar um item ao array `RULES`. Nenhuma regra
conhece a interface; a interface não conhece nenhuma regra.

| Regra | Dispara quando |
|---|---|
| `FIRST_ACCESS` | Primeiro acesso registrado |
| `NEW_STUDENT` | Matrícula há menos de 30 dias |
| `RETURN_AFTER_ABSENCE` | ≥ 14 dias sem aparecer |
| `LOW_FREQUENCY` | Semana atual ≤ 50% do ritmo do mês (só com baseline ≥ 6) |
| `PLAN_EXPIRING` | Vence em ≤ 7 dias |
| `PLAN_EXPIRED` | Já venceu (severidade **CRITICAL**) |
| `NEW_MODALITY` | Primeira vez naquela catraca |

Limiares centralizados em `ALERT_THRESHOLDS`. Deduplicação por
`(aluno, tipo, dia)` — o mesmo aviso não repete a cada giro de catraca.

**Todo alerta carrega orientação de abordagem**, não só o aviso. "Plano
vencido há 5 dias" vem com *"Encaminhe à recepção com cordialidade. Não trate
o assunto na área de treino."*

## 8. Frequência: visitas, não giros

`AccessService.frequency()` conta **dias distintos**, não eventos.

Um aluno que entra na academia e depois na arena no mesmo dia fez **uma
visita**, não duas. Contar giros inflaria o número e mentiria para o
professor — exatamente o oposto do que este produto existe para fazer.

## 9. Janela do feed: rolante, não "hoje"

O feed "Entraram agora" usa uma janela **rolante de 12 horas**.

Um corte por dia civil esvaziaria a tela à 00h15 e esconderia quem entrou às
23h50 — justamente as pessoas que ainda estão dentro do clube.

Os indicadores do topo continuam sendo **do dia**, porque ali a pergunta é
outra: "quantas entradas tivemos hoje?".

## 10. Preparação para IA (fora do MVP)

A arquitetura já entrega o que uma camada de IA precisaria:

- `AlertContext` é um **resumo estruturado** do aluno (frequência, ausência,
  modalidades, plano) — é literalmente o prompt de entrada;
- a timeline unifica notas e feedbacks em ordem cronológica;
- `RelationshipEvent.metadata` é `Json`, aceita enriquecimento sem migration.

Um `SuggestionService` futuro consumiria `AlertContext` + timeline e
devolveria "próxima melhor ação", sem tocar em nada do que existe hoje.

## 11. Decisões de stack

| Escolha | Por quê |
|---|---|
| **Next.js 15 App Router** | Um runtime para UI e API. Menos superfície operacional para um time pequeno. |
| **PostgreSQL + Prisma** | Índices compostos com ordenação importam muito aqui. Prisma dá migrations versionadas e tipagem ponta a ponta. |
| **Sessão em banco** | Revogável na hora, auditável. JWT só expira — não dá para desligar um acesso. |
| **scrypt nativo** | Memory-hard, sem dependência nativa para compilar no deploy. |
| **SSE** | Ver seção 6. |
| **Tailwind v4** | Design tokens da marca como CSS custom properties, direto no `@theme`. |
| **Zod** | Validação na borda, com a mensagem em português que o usuário lê. |
