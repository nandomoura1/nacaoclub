# Banco de dados

PostgreSQL 16 + Prisma. Schema em `prisma/schema.prisma`.

## Princípio

> O Tecnofit é a fonte oficial. O banco local guarda o que **só existe aqui**
> e o mínimo necessário para performance.

## Entidades

### Identidade e acesso

| Tabela | Papel |
|---|---|
| `users` | Colaboradores. Papel + catraca padrão. |
| `sessions` | Sessões ativas. Guarda o **HMAC** do token, nunca o token. |
| `user_turnstile_permissions` | Autorização explícita usuário ↔ catraca. |

### Operação

| Tabela | Papel |
|---|---|
| `turnstiles` | Catracas. `tecnofit_access_point_id` é o ID **externo real**. |
| `students` | **Projeção mínima** do aluno. Não é o cadastro oficial. |
| `access_events` | Eventos de catraca normalizados e deduplicados. |

### Relacionamento — o coração

| Tabela | Papel |
|---|---|
| `relationship_notes` | Notas qualitativas. Soft delete. |
| `relationship_events` | Feedbacks de um clique. |
| `alerts` | Alertas gerados pelas regras. |

### Governança

| Tabela | Papel |
|---|---|
| `audit_logs` | Trilha com valor anterior e novo. Nunca guarda segredo. |
| `sync_state` | Cursor do poller. Sobrevive a restart. |
| `tecnofit_cache` | Cache com TTL, para respeitar rate limit. |

## Diagrama

```
User ──┬─< Session
       ├─< UserTurnstilePermission >── Turnstile
       ├─< RelationshipNote  >── Student
       ├─< RelationshipEvent >── Student
       ├─< AuditLog
       └── defaultTurnstile ──> Turnstile

Student ──┬─< AccessEvent >── Turnstile
          └─< Alert
```

## Índices e por que cada um existe

| Índice | Consulta que ele serve |
|---|---|
| `access_events(student_id, occurred_at DESC)` | Histórico e frequência do aluno |
| `access_events(turnstile_id, occurred_at DESC)` | Feed filtrado por catraca — a query mais quente |
| `access_events(occurred_at DESC)` | Feed "Todas as catracas" |
| `access_events.dedupe_key` **UNIQUE** | **Garantia** de deduplicação sob concorrência |
| `access_events.external_event_id` **UNIQUE** | Deduplicação por ID da origem |
| `relationship_notes(student_id, created_at DESC)` | Timeline do perfil |
| `alerts.dedupe_key` **UNIQUE** | Não repetir o mesmo alerta no mesmo dia |
| `sessions.token_hash` **UNIQUE** | Resolução de sessão a cada requisição |
| `students.last_seen_at` | Ordenação da busca |

> Os índices `DESC` não são decoração: sem eles o Postgres faz sort em cada
> carregamento do dashboard, que é a tela mais acessada do sistema.

## Escolhas de modelagem

### Por que `dedupe_key` é sempre preenchida

Mesmo quando existe `external_event_id`. Se webhook e poller descreverem o
mesmo evento com IDs diferentes, só a chave determinística os reconcilia.

### Por que `students` existe se o Tecnofit é a fonte

Três razões concretas:

1. **Velocidade** — o card precisa aparecer em ~2s. Não dá para depender de
   uma chamada externa a cada renderização.
2. **Resiliência** — se a API cair, o professor ainda vê quem chegou.
3. **Integridade referencial** — notas e eventos precisam apontar para uma
   entidade estável.

`synced_at` marca o frescor. Abaixo de 15 minutos não incomodamos a API.

### Por que soft delete nas notas

Auditoria (seção 23 do brief). `deleted_at` preserva o registro e o
`AuditLog` guarda o conteúdo excluído. Nada some em silêncio.

### Por que `modalities` é `String[]` e não tabela

No MVP é lista de exibição vinda do Tecnofit, sem semântica própria no nosso
domínio. Quando houver regra de negócio sobre modalidade, vira tabela.
Normalizar antes disso seria complexidade sem retorno.

### Por que `raw_snapshot` é `Json`

Depuração da integração. Como o formato real da API não pôde ser confirmado,
guardar o payload normalizado permite diagnosticar mapeamento errado sem
reproduzir o evento. **Nunca contém credenciais** — a redação acontece antes.

## Migrations

```bash
npm run db:migrate          # cria e aplica (desenvolvimento)
npm run db:deploy           # aplica pendentes (produção)
npm run db:seed             # dados fictícios de desenvolvimento
npm run db:studio           # inspeção visual
```

A migration inicial vive em
`prisma/migrations/<timestamp>_init_nacao_relationship/`.

## Seed

**Nenhum dado real** (seção 65 do brief). Cria:

- 6 catracas com IDs `MOCK-AP-*` que casam com o provider mock;
- 3 usuários (ADMIN, GESTOR, PROFESSOR) com senha `nacao@2026`;
- permissões que provam o controle de acesso: o professor enxerga **2 de 6**
  catracas.

Alunos e eventos **não** são semeados — chegam pelo provider mock via poller,
exercitando o caminho real de ingestão.

## Retenção (LGPD)

| Dado | Retenção sugerida |
|---|---|
| `access_events` | 24 meses, depois agregar |
| `relationship_notes` | Enquanto o aluno for ativo + 12 meses |
| `audit_logs` | 24 meses |
| `sessions` expiradas | Limpeza contínua (`pruneExpiredSessions`) |
| `tecnofit_cache` | TTL curto, limpeza por `expires_at` |

Ainda **não há job automático de expurgo** — é um item consciente de
backlog, registrado em `docs/security.md`.
