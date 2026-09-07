# Integração Tecnofit

> **Documento mais importante do projeto.** Ele registra o que sabemos, o que
> não sabemos e como sair do "não sabemos" sem reescrever o sistema.

## 1. Estado da investigação

A documentação oficial da API foi **localizada** mas **não pôde ser lida** no
ambiente em que este sistema foi desenvolvido.

| Item | Situação |
|---|---|
| Portal oficial | `https://api-externa-tecnofit.readme.io` — existe e está ativo |
| Acesso ao conteúdo | **Bloqueado.** O proxy de egresso da rede de desenvolvimento retorna `403` para o domínio |
| Credenciais de produção | Não fornecidas até o momento |

Tudo o que segue marcado como **CONFIRMADO** veio de fontes públicas
verificáveis. Tudo marcado como **NÃO VERIFICADO** é uma hipótese de
engenharia que **precisa ser validada** contra a documentação oficial antes
de ir para produção.

### 1.1 O que está CONFIRMADO

**Autenticação em duas etapas** (confirmado pela tela de criação de chave no
painel Tecnofit, em 03/09/2026):

> *"As chaves de acesso consistem em duas partes: uma chave pública e uma
> chave privada. Você deve usar tanto a chave pública quanto a chave privada
> juntas para autenticar e **receber seu token de acesso temporário**."*

Isso significa que **não é** autenticação por chave estática em header. O
fluxo real é:

```
POST <base>/<authToken>          { "api_key": "pk_tf_…", "api_secret": "sk_tf_…" }
        ↓
   token de acesso TEMPORÁRIO
        ↓
Authorization: Bearer <token>     em todas as demais chamadas
```

| Item | Valor |
|---|---|
| Nome do campo da chave pública | `api_key` |
| Nome do campo da chave privada | `api_secret` |
| Prefixo da chave pública | `pk_tf_` |
| Prefixo da chave privada | `sk_tf_` |
| Visibilidade da chave privada | **Exibida uma única vez.** Não é recuperável — só substituível. |

**Recomendações de segurança da própria Tecnofit**, adotadas neste projeto:

- nunca armazenar a chave em texto simples, em código ou em repositório
  → as credenciais vivem apenas em `.env`, que está no `.gitignore`;
- desativar a chave quando não for mais necessária;
- habilitar permissões de menor privilégio.

**Ainda não identificado:** o **path** do endpoint que faz essa troca, o
formato exato da resposta e a validade do token.


- Arquitetura **REST**, troca de dados em **JSON**.
- Os headers `Content-Type` e `Accept` devem ser **definidos explicitamente**
  em cada requisição.
- **Rate limit: 100 requisições/minuto por endpoint por IP** e
  **200 requisições/minuto no total da API**.
- Requisito mínimo de **TLS 1.2+**.
- A API é ativada e as chaves são geradas **dentro do próprio sistema
  Tecnofit** (área de Integrações do painel).
- Existe um recurso de **Webhook** configurável no painel Tecnofit
  (Integrações → Configurar → Criar Webhook).
- Existe um programa **"Tecnofit Catraca"** para leitores biométricos externos.
- **Multiempresa:** chaves do tipo *"Integração Multiempresa"* exigem o header
  customizado `X-Company-Id` com o ID da unidade/filial em determinados
  endpoints. Implementado e controlado por `TECNOFIT_COMPANY_ID` — omitido
  quando vazio, já que enviá-lo numa chave de empresa única pode ser rejeitado.
- A integração ocorre **em ambiente de produção, com dados reais da academia**.
  Não há sandbox documentado. Isso reforça a decisão de manter o provider
  `mock` como padrão: nenhum experimento acidental toca dado real.
- A própria Tecnofit recomenda implementar a integração **no backend**, para
  não expor chaves — exatamente a arquitetura adotada aqui.
- Índice completo da documentação em `https://api-externa-tecnofit.readme.io/llms.txt`.
  Qualquer página aceita `.md` no final para retornar markdown.

### 1.2 O que NÃO foi identificado

Estes pontos estão **explicitamente em aberto**. Nenhum deles foi inventado
no código.

| Pergunta | Situação |
|---|---|
| URL base da API | **Não identificada na documentação disponível.** |
| **Path** do endpoint de autenticação (troca de credenciais por token) | **Não identificado.** |
| Formato da resposta de autenticação (nome do campo do token) | **Não identificado.** O adapter tenta `access_token`, `accessToken`, `token`, `data.token`. |
| **Validade** do token temporário | **Não identificada.** Sem `expires_in`/`expires_at` na resposta, o adapter renova a cada 10 minutos. |
| Path do endpoint de **eventos de acesso/catraca** | **Não identificado.** |
| Path do endpoint de **alunos** | **Não identificado.** |
| Path do endpoint de **pontos de acesso (catracas)** | **Não identificado.** |
| Nomes reais dos campos em cada recurso | **Não identificados.** |
| IDs reais das catracas do Nação Club | **Não identificados.** Devem vir da API ou do painel. |
| Formato de paginação (cursor? offset? página?) | **Não identificado.** |
| Existe webhook **especificamente de passagem de catraca**? | **Não identificado.** |
| Formato do payload do webhook | **Não identificado.** |
| A Tecnofit assina o webhook? Com qual header e algoritmo? | **Não identificado.** |
| A API expõe **foto** do aluno? | **Não identificado.** |
| A API expõe **modalidades** por aluno? | **Não identificado.** |
| A API expõe **data de vencimento do plano**? | **Não identificado.** |

> **Consequência de produto:** o sistema exibe "Não informado" para qualquer
> dado ausente e **nunca** preenche por inferência. Um professor que lê um
> número na tela precisa poder confiar que aquele número é real.

## 2. Como o sistema lida com essa incerteza

A resposta arquitetural é um **Anti-Corruption Layer** com **mapeamento
declarativo**. Nenhuma especificidade da API Tecnofit está espalhada pelo
código — ela vive inteira em um arquivo de configuração.

```
                    ┌──────────────────────────────────┐
  API Tecnofit ────►│  TecnofitProvider                │
  (ou Webhook)      │  ├── HttpTecnofitProvider  (real)│
                    │  └── MockTecnofitProvider  (dev) │
                    └───────────────┬──────────────────┘
                                    │  interface única
                                    ▼
                    ┌──────────────────────────────────┐
                    │  normalizer.ts                   │
                    │  guiado por endpoint-map.ts      │
                    └───────────────┬──────────────────┘
                                    ▼
                       Tipos de domínio do Nação
                    (TecnofitStudent, TecnofitAccessEvent…)
                                    ▼
                       Services · Alertas · Realtime · UI
```

O restante do sistema **só conhece a interface `TecnofitProvider`**. Nenhum
service, nenhuma rota e nenhum componente sabe que a Tecnofit existe.

### 2.1 O arquivo que concentra a incerteza

`src/server/tecnofit/endpoint-map.ts`

Ele declara, em um só lugar:

- **paths** — o caminho e o método de cada recurso;
- **queryParams** — como se chamam os parâmetros de paginação e filtro;
- **collection** — onde encontrar a lista dentro do envelope de resposta;
- **fields** — o mapeamento *campo do domínio → caminhos candidatos na origem*;
- **valueMaps** — tradução de valores (`"entrada"` → `ENTRY`, `"ativo"` → `ACTIVE`).

O mapeamento de campos aceita **múltiplos candidatos por campo**:

```ts
externalId: ['id', 'student_id', 'studentId', 'customer_id', 'codigo']
```

O primeiro caminho que devolver valor vence. Isso absorve variação de
nomenclatura (snake_case, camelCase, português, inglês) sem exigir mudança
de código.

### 2.2 Por que os paths estão VAZIOS por padrão

Porque o brief é explícito: **não inventar endpoints**.

Com o path vazio, o `HttpTecnofitProvider` **recusa a chamada** com um erro
claro:

```
TecnofitError[NOT_CONFIGURED]:
  Endpoint não configurado. Preencha src/server/tecnofit/endpoint-map.ts
  ou a variável TECNOFIT_ENDPOINT_MAP com o path oficial.
  Este sistema não adivinha endpoints.
```

Falhar alto e cedo é muito melhor que disparar uma requisição adivinhada
contra a API de produção do clube.

## 3. Como ativar a integração real

Três passos. **Nenhuma linha de lógica muda.**

### Passo 1 — Obter credenciais

No painel Tecnofit: **Configurações → Integrações → API**. Gere a chave e o
segredo. Preencha no `.env`:

```bash
TECNOFIT_PROVIDER="http"
TECNOFIT_API_BASE_URL="<base url oficial>"
TECNOFIT_API_KEY="<sua chave>"
TECNOFIT_API_SECRET="<seu segredo>"
TECNOFIT_AUTH_SCHEME="token-exchange"
```

> As credenciais aparecem **uma única vez** na criação. Se você perdê-las,
> crie uma nova chave e inative a antiga — não há recuperação.

### Passo 2 — Preencher o mapa de endpoints

Com a documentação aberta, edite `src/server/tecnofit/endpoint-map.ts`, ou
defina a variável `TECNOFIT_ENDPOINT_MAP` com um JSON (que tem precedência):

O **primeiro** path a preencher é `authToken` — sem ele, nenhuma outra
chamada acontece, porque toda requisição depende do token.

```bash
TECNOFIT_ENDPOINT_MAP='{
  "paths": {
    "authToken":        { "path": "v1/auth/token",   "method": "POST" },
    "listAccessPoints": { "path": "v1/access-points", "method": "GET" },
    "listAccessEvents": { "path": "v1/accesses",      "method": "GET" },
    "getStudent":       { "path": "v1/students/{id}", "method": "GET" },
    "searchStudents":   { "path": "v1/students",      "method": "GET" }
  }
}'
```

> Os paths acima são **exemplo ilustrativo de formato**, não afirmação sobre
> a API real. Substitua pelos oficiais.

### Passo 3 — Validar antes de confiar

```bash
npm run tecnofit:probe
```

O probe testa conectividade, autenticação e o formato das respostas, e
**relata quais campos do mapa casaram e quais não casaram** — sem gravar nada
no banco.

### Passo 4 — Descobrir os IDs reais das catracas

```bash
# autenticado como ADMIN
curl -X POST https://<seu-host>/api/turnstiles
```

`TurnstileService.syncFromTecnofit()` lê os pontos de acesso da API e cria as
catracas locais com o `tecnofit_access_point_id` **real**. Depois disso um
ADMIN pode renomear cada catraca para o nome que o professor reconhece
("Catraca Futevôlei" em vez de "AP-0034") — a sincronização **não sobrescreve
nome editado por humano**.

## 4. Ingestão de eventos: duas portas, um funil

O sistema implementa **webhook e polling** desde o dia um, porque não foi
possível confirmar se a Tecnofit oferece webhook de catraca.

```
   WEBHOOK  ─────┐
                 ├──► IngestService.ingestOne()
   POLLING  ─────┘         │
                           ├─ deduplicação
                           ├─ resolve aluno (com cache)
                           ├─ resolve catraca
                           ├─ persiste
                           ├─ avalia alertas
                           └─ publica no barramento realtime
```

Como **os dois caminhos desaguam no mesmo funil**, ligar o webhook depois é
uma mudança de variável de ambiente:

```bash
ACCESS_INGEST_MODE="both"   # "webhook" | "polling" | "both"
```

Rodar os dois ao mesmo tempo é seguro: a deduplicação garante que o evento
entregue pelas duas portas vire **um único card**.

### 4.1 O poller

- **Cursor persistido** em `sync_state` — sobrevive a restart, não relê o mundo.
- **Janela de sobreposição** (`ACCESS_POLL_OVERLAP_SECONDS`, padrão 60s) para
  cobrir latência de escrita na origem.
- **Backoff progressivo**: falhas seguidas alongam o intervalo até 5 minutos.
  Não martelamos uma API que já está sofrendo.
- **Guarda de concorrência**: um ciclo por vez.
- **Teto de paginação**: 20 páginas por ciclo, contra cursor infinito.

### 4.2 O webhook

`POST /api/webhooks/tecnofit`

- Verifica **HMAC-SHA256** do corpo cru quando `TECNOFIT_WEBHOOK_SECRET` está
  configurado. Aceita `sha256=<hex>` e hex puro.
- **Falha fechada em produção**: sem segredo configurado, responde `503`.
  Um webhook aberto permitiria a qualquer pessoa forjar a chegada de um aluno.
- Aceita objeto único ou coleção, em qualquer envelope conhecido.
- Responde `200` mesmo sem evento reconhecível, para não gerar retentativa
  infinita na origem. O diagnóstico vai para o log.

> **NÃO VERIFICADO:** o header e o algoritmo de assinatura reais.
> Ajustáveis por `TECNOFIT_WEBHOOK_SIGNATURE_HEADER`.

## 4.3 Gestão do token de acesso

O token é temporário, então o adapter o trata como recurso gerenciado:

| Comportamento | Por quê |
|---|---|
| **Cache em memória** | Sem cache, cada chamada gastaria duas requisições. Com rate limit de 100/min, metade do orçamento iria embora só em autenticação. |
| **Renovação com margem de 60s** | Relógios divergem e a rede demora. Renovar exatamente no vencimento produz falha intermitente. |
| **Deduplicação da requisição em voo** | Várias chamadas simultâneas compartilham uma única autenticação, em vez de disparar N. |
| **Renovação em 401, uma vez** | O token pode ser revogado antes de expirar. Uma renovação e repetição, sem laço infinito. |
| **TTL conservador de 10 min** | Usado apenas quando a API não informa validade. Renovar demais custa uma requisição; usar token expirado quebra a ingestão. |

Coberto por 13 testes em `tests/auth-token.test.ts`.

## 5. Respeito ao rate limit

Limite oficial: **100 req/min por endpoint/IP**, **200 req/min global**.

- `SlidingWindowLimiter` trabalha com teto configurável
  (`TECNOFIT_RATE_LIMIT_PER_MINUTE`, padrão **80**) — abaixo do limite oficial
  de propósito.
- `Retry-After` é respeitado quando a API o envia.
- Backoff exponencial com jitter nos retries.
- Cache de projeção de aluno: só reconsultamos após 15 minutos.

> **Limitação conhecida:** o limitador é **por processo**. Em deploy com
> múltiplas instâncias é preciso um limitador compartilhado (Redis) ou
> concentrar a ingestão em um worker único. Ver `docs/deployment.md`.

## 6. Campos que o produto usa e o que fazer se faltarem

| Campo | Uso no produto | Se a API não fornecer |
|---|---|---|
| ID do aluno | **Obrigatório.** Chave de tudo. | Evento é descartado e logado. |
| Nome completo | Card e perfil | Evento é descartado — card sem nome é inútil. |
| Foto | Avatar | Fallback com iniciais sobre o azul da marca. |
| Plano | Card e perfil | "Plano não informado". |
| Modalidades | Card e perfil | Lista vazia, seção omitida. |
| Data de matrícula | "Aluno há X" | "Não informado". |
| Vencimento do plano | Alertas `PLAN_EXPIRING` / `PLAN_EXPIRED` | As duas regras ficam **silenciosas**. |
| ID da catraca | Filtro de catraca | Casa por nome; se falhar, guarda em `raw_turnstile_ref`. |
| Horário do evento | **Obrigatório.** | Evento é descartado. |
| ID único do evento | Deduplicação | `dedupeKey` determinística assume o papel. |

## 7. Perguntas para a Tecnofit

Lista pronta para abrir um chamado:

1. Qual a **URL base** da API externa em produção e em homologação?
2. Qual o **path do endpoint de autenticação** que troca `api_key` +
   `api_secret` pelo token temporário? Qual o nome do campo do token na
   resposta e qual a **validade** dele?
3. Existe endpoint de **eventos de acesso/catraca**? Qual o path, quais filtros
   de data e qual o formato de paginação?
4. Existe **webhook de passagem de catraca**? Qual o payload e como a
   assinatura é calculada?
5. O recurso de aluno expõe **foto**, **modalidades** e **vencimento do plano**?
6. Como obter a lista de **pontos de acesso (catracas)** com seus IDs?
7. Qual a **latência típica** entre a passagem física e a disponibilidade do
   evento na API? (define o intervalo mínimo útil do poller)
8. O rate limit de 100/min é por **endpoint** ou por **recurso**?

## 8. Enquanto isso: o provider mock

`TECNOFIT_PROVIDER="mock"` (padrão) sobe o sistema **inteiro e funcional**
sem credenciais:

- 6 catracas fictícias espelhando as modalidades reais do clube;
- 60 alunos fictícios com planos e modalidades;
- eventos gerados a partir do relógio, então o poller vê chegadas novas a
  cada ciclo — como aconteceria com a catraca real.

**Todos os identificadores usam o prefixo `MOCK-`**, justamente para que um
dado de mock jamais possa ser confundido com um dado real do Tecnofit.
