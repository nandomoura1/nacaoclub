# Deploy e operação

## 1. Desenvolvimento local

### Pré-requisitos
Node ≥ 20.11 · PostgreSQL 16 (ou Docker)

```bash
git clone <repo> && cd nacaoclub
npm install

cp .env.example .env
# Gere o segredo de sessão:
openssl rand -hex 32     # cole em SESSION_SECRET

npm run db:migrate       # cria o schema
npm run db:seed          # usuários e catracas fictícios
npm run dev              # http://localhost:3000
```

Com `TECNOFIT_PROVIDER="mock"` (padrão) o sistema sobe **inteiro e
funcional**, sem credenciais. Alunos e chegadas são gerados pelo provider
mock e ingeridos pelo poller.

**Credenciais de desenvolvimento** (criadas pelo seed):

| Papel | E-mail | Senha |
|---|---|---|
| ADMIN | `admin@nacaoclub.dev` | `nacao@2026` |
| GESTOR | `gestor@nacaoclub.dev` | `nacao@2026` |
| PROFESSOR | `professor@nacaoclub.dev` | `nacao@2026` |

O professor enxerga apenas **2 das 6 catracas** — é o cenário que prova o
controle de permissão.

### Postgres via Docker

```bash
docker run -d --name nacao-db \
  -e POSTGRES_USER=nacao -e POSTGRES_PASSWORD=nacao \
  -e POSTGRES_DB=nacao_relationship \
  -p 5432:5432 postgres:16
```

## 2. Verificação

```bash
npm run typecheck   # TypeScript estrito
npm test            # 67 testes
npm run build       # build de produção
curl localhost:3000/api/health
```

## 3. Homologação

Ambiente **idêntico** ao de produção, com banco separado.

```bash
NODE_ENV=production
DATABASE_URL=<banco de homologação>
TECNOFIT_PROVIDER=http
TECNOFIT_API_BASE_URL=<endpoint de sandbox, se houver>
ACCESS_INGEST_MODE=polling
LOG_LEVEL=debug
```

**Checklist antes de promover:**

- [ ] `npm run tecnofit:probe` passa contra a API real
- [ ] Catracas sincronizadas com IDs reais (`POST /api/turnstiles` como ADMIN)
- [ ] Nomes das catracas ajustados para o que o professor reconhece
- [ ] Um evento real de catraca aparece no dashboard
- [ ] Deduplicação verificada: reiniciar o poller **não** duplica eventos
- [ ] Permissões testadas com um usuário PROFESSOR real
- [ ] `/api/health` retorna `status: ok`

## 4. Produção

### Variáveis obrigatórias

```bash
NODE_ENV=production
DATABASE_URL=postgresql://...
SESSION_SECRET=<openssl rand -hex 32>       # ÚNICO por ambiente
TECNOFIT_PROVIDER=http
TECNOFIT_API_BASE_URL=...
TECNOFIT_API_KEY=...
TECNOFIT_API_SECRET=...
TECNOFIT_ENDPOINT_MAP='{...}'                # ver docs/tecnofit-integration.md
ACCESS_INGEST_MODE=polling                   # ou both, se houver webhook
TECNOFIT_WEBHOOK_SECRET=...                  # obrigatório se webhook ativo
LOG_LEVEL=info
```

> **Segredos vão no cofre do provedor** (variáveis de ambiente da plataforma,
> AWS Secrets Manager, Vault). Nunca em arquivo versionado, nunca em imagem
> Docker.

### Sequência de deploy

```bash
npm ci
npm run db:deploy      # migrations ANTES de subir a aplicação
npm run build
npm start
```

### Docker

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json prisma ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nacao && adduser -S nacao -G nacao
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
USER nacao
EXPOSE 3000
CMD ["npm", "start"]
```

## 5. Escala horizontal — leia antes de subir a segunda instância

Três componentes hoje são **em processo**:

| Componente | Sintoma com N instâncias | Correção |
|---|---|---|
| Barramento realtime | Evento ingerido na instância A não chega ao SSE da B | Postgres `LISTEN/NOTIFY` ou Redis pub/sub |
| Rate limiter Tecnofit | N × 80 req/min pode estourar o limite oficial de 100 | Limitador compartilhado, ou concentrar ingestão |
| Rate limit de login | Proteção enfraquece proporcionalmente | Redis |

**Caminho recomendado e mais simples:** separar a ingestão em um **worker
único** e deixar as instâncias web apenas servindo. O poller já é idempotente
e tem guarda de concorrência; basta rodar `startPoller()` só no worker
(`ACCESS_INGEST_MODE=webhook` nas instâncias web) e trocar o barramento por
`LISTEN/NOTIFY`.

Para o volume de um clube único, **uma instância bem dimensionada resolve** —
não antecipe essa complexidade sem necessidade medida.

## 6. Proxy reverso

O SSE exige desligar o buffer. A aplicação já envia `X-Accel-Buffering: no`,
mas confirme no nginx:

```nginx
location /api/dashboard/stream {
    proxy_pass http://app:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
}
```

Sem isso o nginx segura o stream e o dashboard parece congelado.

## 7. Monitoramento

`GET /api/health` (público, sem dado pessoal) retorna:

```json
{
  "status": "ok",
  "checks": {
    "database":  { "ok": true, "detail": "conectado" },
    "tecnofit":  { "ok": true, "detail": "http: Conexão estabelecida." }
  },
  "sync": { "lastOkAt": "...", "failureCount": 0 },
  "realtimeListeners": 3
}
```

Responde **503** quando degradado.

**Alertar quando:**

- `status != "ok"` por mais de 2 minutos;
- `sync.failureCount > 3` — a integração está falhando de forma persistente;
- `sync.lastOkAt` mais velho que 5× o intervalo do poller — parou de ingerir;
- `realtimeListeners == 0` em horário de pico — ninguém está com o dashboard
  aberto, ou o SSE quebrou.

Os logs são **JSON estruturado** em stdout, com segredos já redigidos. Basta
coletar (CloudWatch, Loki, Datadog).

## 8. Rollback

```bash
# 1. Voltar a versão da aplicação
git checkout <tag-anterior> && npm ci && npm run build && npm start
```

**Sobre migrations:** o Prisma não gera down migration automaticamente.
Migrations **aditivas** (novas tabelas e colunas nulas) são compatíveis com a
versão anterior — o rollback da aplicação basta.

Para mudança **destrutiva**, o procedimento é:

1. deploy aditivo (nova coluna, escrita dupla);
2. backfill;
3. deploy que passa a ler a nova coluna;
4. só então, em um deploy seguinte, remover a antiga.

Assim todo rollback é sempre um passo atrás compatível.

**Antes de qualquer migration em produção:**

```bash
pg_dump "$DATABASE_URL" > backup-$(date +%F-%H%M).sql
```

## 9. Backup

- **Banco:** backup diário automático + retenção de 30 dias. Este banco
  contém as notas de relacionamento, que **não existem em nenhum outro
  lugar** — o Tecnofit não as tem.
- **Restauração testada trimestralmente.** Backup não testado é esperança,
  não backup.

## 10. Operações comuns

```bash
# Sincronizar catracas com a API (autenticado como ADMIN)
curl -X POST https://<host>/api/turnstiles -b "nacao_session=<token>"

# Estado do poller
curl https://<host>/api/health | jq .sync

# Validar a integração sem gravar nada
npm run tecnofit:probe
```
