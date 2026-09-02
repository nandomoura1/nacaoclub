# Segurança e LGPD

## 1. Autenticação

**Sessão opaca persistida em banco.** Não usamos JWT.

| Aspecto | Implementação |
|---|---|
| Senha | `scrypt` nativo, salt de 16 bytes, chave de 64 bytes |
| Formato | `scrypt$1$<salt_hex>$<hash_hex>` — prefixo versionado permite migrar algoritmo |
| Comparação | `timingSafeEqual` — sem oráculo de temporização |
| Token de sessão | 32 bytes aleatórios, `base64url` |
| Armazenamento | Apenas o **HMAC-SHA256** do token. Um dump do banco não permite forjar sessão. |
| Cookie | `httpOnly`, `sameSite=lax`, `secure` em produção |
| Revogação | `revokedAt` — desligar um acesso é imediato, não espera expirar |

### Por que não JWT

Um JWT só expira. Se um tablet da recepção for perdido às 14h com sessão de
12h, o acesso continua válido até as 2h da manhã. Com sessão em banco, o
gestor revoga na hora.

### Anti-enumeração de contas

- Mensagem **idêntica** para e-mail inexistente e senha errada.
- Verificação falsa de hash quando o e-mail não existe, para **igualar o
  tempo de resposta**. Sem isso, a diferença de latência entrega quais
  e-mails existem.
- Rate limit: 8 tentativas por IP em 10 minutos.

> **Limitação conhecida:** o rate limit de login é **em memória**, por
> processo. Em deploy multi-instância precisa migrar para store compartilhado.

## 2. Autorização

**Sempre no servidor.** O frontend pode esconder um botão por conveniência,
mas a decisão real está no service.

### Matriz de permissões

| Permissão | PROFESSOR | GESTOR | ADMIN |
|---|:---:|:---:|:---:|
| Ver alunos e histórico | ✅ | ✅ | ✅ |
| Criar nota / feedback | ✅ | ✅ | ✅ |
| Editar/excluir **nota própria** | ✅ | ✅ | ✅ |
| Editar/excluir **nota de terceiro** | ❌ | ✅ | ✅ |
| Ver **todas** as catracas | ❌ | ✅ | ✅ |
| Reconhecer alertas | ❌ | ✅ | ✅ |
| Ler auditoria | ❌ | ✅ | ✅ |
| Gerenciar catracas / usuários / integração | ❌ | ❌ | ✅ |

O PROFESSOR **nunca** altera dado oficial do Tecnofit — plano, pagamento,
cadastro. O sistema não expõe nenhuma rota que faça isso.

### Filtro de catraca

`allowedTurnstileIds()` devolve:

- `null` → sem restrição (GESTOR / ADMIN);
- lista → catraca padrão + explicitamente autorizadas (PROFESSOR).

Aplicado **na query**, não depois. Um professor jamais recebe do servidor um
evento que não pode ver, nem por engano de UI. Vale também para o SSE: o
stream filtra antes de enviar o byte.

**Verificado em execução:** professor recebe `403` ao tentar
`/api/dashboard/feed?turnstileId=<catraca alheia>` e ao abrir o SSE dela.

## 3. Defesa em camadas

O `middleware.ts` verifica apenas a **presença** do cookie — ele roda no edge
e não tem acesso ao banco. Um cookie forjado passa por ele.

Isso é intencional e documentado no próprio arquivo: o middleware é
**conveniência de navegação**, não autorização. A validação real (sessão
existe, não expirou, não foi revogada, usuário ativo) acontece em
`getCurrentUser()`, no servidor, em **toda** página e **toda** rota de API.

As rotas de API ficam **fora** do matcher de propósito: elas respondem `401`
em JSON via `withAuth`, que é o comportamento correto para um cliente
`fetch`. Redirecionar uma chamada de API para HTML quebraria o dashboard em
silêncio.

## 4. Proteção de credenciais

- **Nenhum segredo no código.** Tudo por ambiente, validado com Zod no boot.
- `.env` está no `.gitignore`. `.env.example` documenta sem valores.
- **Nenhuma variável Tecnofit tem prefixo `NEXT_PUBLIC_`** — o frontend nunca
  fala com a API externa.
- O logger **reda automaticamente** chaves sensíveis em qualquer profundidade:
  `password`, `token`, `secret`, `apiKey`, `authorization`, `cookie`,
  `signature`, `cpf`. A redação é estrutural — não depende de disciplina de
  quem chama.
- `AuditService` passa todo valor por `redact()` antes de gravar.
- Erros da Tecnofit logam **apenas o path**. Query e corpo podem conter dado
  pessoal.

Coberto por 6 testes em `tests/logger.test.ts`.

## 5. Validação de entrada

Toda rota valida com **Zod** antes de tocar em qualquer service. O Prisma
usa queries parametrizadas — não há concatenação de SQL em lugar nenhum.

XSS: o React escapa por padrão e **não usamos `dangerouslySetInnerHTML`**.

## 6. Webhook

- HMAC-SHA256 do corpo cru, comparação em tempo constante.
- **Falha fechada em produção**: sem `TECNOFIT_WEBHOOK_SECRET` configurado,
  responde `503`. Um webhook aberto permitiria a qualquer pessoa forjar a
  chegada de um aluno — e portanto a presença dele no clube.

## 7. Headers HTTP

Definidos em `next.config.ts`:

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

`poweredByHeader: false`. As páginas são `noindex, nofollow` — é sistema
interno.

## 8. LGPD

### Minimização

Não replicamos CPF, endereço, telefone nem dado financeiro. A busca **não
aceita CPF como critério** e **não o retorna**.

### Finalidade

As notas de relacionamento existem para **melhorar o atendimento**. O modal
diz isso ao usuário, no momento em que ele escreve:

> *"Registre apenas informações relevantes para melhorar a experiência do
> aluno."*

### Rastreabilidade

Toda nota tem autor e data imutáveis. Toda edição registra valor anterior e
novo. Toda exclusão é soft delete + auditoria. **Nada muda em silêncio.**

### Controle de acesso

Nota de relacionamento é dado interno, visível apenas a colaboradores
autenticados. Professor não edita nota de terceiro.

### Conteúdo impróprio

O limite de 1000 caracteres e a categorização obrigatória induzem registro
objetivo. **O sistema não faz moderação automática** — é uma limitação
consciente do MVP. A mitigação atual é organizacional: autoria rastreável
mais orientação explícita na interface.

## 9. Limitações conhecidas

Registradas honestamente, não escondidas:

| Limitação | Impacto | Mitigação prevista |
|---|---|---|
| Rate limit de login em memória | Multi-instância enfraquece a proteção | Redis |
| Rate limiter da Tecnofit em processo | Pode estourar o limite oficial com N instâncias | Limitador compartilhado ou worker único |
| Barramento realtime em processo | SSE não recebe evento de outra instância | Postgres `LISTEN/NOTIFY` ou Redis pub/sub |
| Sem expurgo automático (retenção) | Dado acumula além do necessário | Job agendado |
| Sem 2FA | — | Avaliar para ADMIN |
| Sem CSP | XSS teria menos contenção | Adicionar header com nonce |
| Sem moderação de conteúdo em notas | Registro impróprio depende de processo | Revisão por GESTOR |
| Middleware não valida sessão no edge | Nenhum — a validação real é no servidor | Por design |
