# NAÇÃO ATHX — LIVE LEADERBOARD

**Nação Celebration · Etapa Setembro Amarelo · 12 de setembro · Nação Club, Brasília**

Leaderboard esportivo em tempo real: a organização lança os resultados, o
público acompanha pelo celular sem login e sem apertar F5, e o telão do ginásio
se atualiza sozinho.

> *Muitos esportes, muitas paixões, uma Nação!*

---

## Comece em 60 segundos (sem banco nenhum)

```bash
cd athx
npm install
cp .env.example .env.local     # já vem com NEXT_PUBLIC_DEMO_MODE=true
npm run dev                    # http://localhost:3000
```

Pronto. O **modo demo** roda a aplicação inteira com 20 duplas fictícias —
incluindo empates, duplas que estouraram o CAP e duplas ainda sem resultado —
para você avaliar o produto antes de criar qualquer coisa no Supabase.

Nomes de duplas e atletas são **claramente fictícios**. Nenhum nome real é usado.

---

## Rotas

| Rota | Quem usa | O que faz |
|---|---|---|
| `/` | Público | Hero, resumo do evento e classificação geral |
| `/leaderboard` | Público | Só o leaderboard, com busca e filtros |
| `/team/[id]` | Público | Detalhe da dupla com os três WODs abertos |
| `/wod/1` `/wod/2` `/wod/3` | Público | Prescrição, CAP, provas e ranking do WOD |
| `/schedule` | Público | Programação do dia |
| `/qr` | Organização | QR Code do leaderboard, com download em PNG |
| `/display` | Telão | Top 10 em tela cheia, letras grandes, atualização automática |
| `/login` | Organização | Login administrativo (Supabase Auth) |
| `/admin` | Organização | Painel com o andamento de cada WOD |
| `/admin/teams` | Organização | Cadastro e edição das duplas |
| `/admin/wod/1..3` | Organização | Lançamento de resultados por bateria |
| `/admin/results` | Organização | Conferência, homologação, auditoria e exportação |
| `/admin/settings` | Organização | Live mode, manutenção e as regras ainda em aberto |
| `/api/snapshot` | Interno | Estado completo do evento em JSON |
| `/api/export` | Organização | `?format=csv` ou `?format=json` |

---

## Arquitetura

```
        ADMIN                      POSTGRES                     PÚBLICO
   ┌─────────────┐          ┌────────────────────┐        ┌──────────────┐
   │ lança       │  upsert  │ wod1/2/3_results   │        │ celular      │
   │ resultado   ├─────────►│        │           │        │ telão        │
   └─────────────┘          │        ▼           │        │ TV           │
                            │ gatilho recalcula  │        └──────┬───────┘
   ┌─────────────┐   rpc    │        │           │               │
   │ PUBLICAR    ├─────────►│        ▼           │  realtime     │
   └─────────────┘          │ wod_results (resumo)├──────────────►│
                            │        │           │               │
                            │        ▼           │  /api/snapshot│
                            │ athx_standings     │◄──────────────┘
                            └────────────────────┘
```

### Três decisões que sustentam o resto

**1. O cálculo não vive no frontend.**
O ranking existe duas vezes, de propósito: em TypeScript
(`src/lib/scoring/`) e em SQL (`supabase/migrations/…_scoring.sql`). Os dois são
verificados um contra o outro por um teste de paridade (`tests/parity.test.ts`)
cujo gabarito **é a saída real do PostgreSQL**. Se alguém mexer em um lado e
esquecer do outro, o teste quebra. Dois administradores não conseguem gerar
classificações diferentes.

**2. O público recebe um snapshot, não N consultas.**
São 20 duplas — o estado inteiro do evento é menor que uma foto. Quando o
Realtime avisa que algo mudou, o cliente busca `/api/snapshot` uma vez e
recalcula localmente com o mesmo motor. Rajadas são agrupadas: salvar 10 duplas
de uma bateria gera **uma** busca, não dez.

**3. Rascunho antes de público.**
Todo resultado nasce `DRAFT` e ninguém de fora enxerga — isso é garantido pelo
RLS, não pela interface. Um erro de digitação não vai parar no telão.

### Pastas

```
athx/
├── src/
│   ├── app/                    rotas (App Router)
│   │   ├── admin/              painel + server actions
│   │   ├── api/                snapshot e exportação
│   │   └── …                   páginas públicas
│   ├── components/
│   │   ├── ui/                 Button · Card · Badge · Input · Modal · Tabs
│   │   ├── admin/              WodEntry · TeamsManager · ResultsReview · …
│   │   └── …                   RankingTable · Podium · LiveIndicator · …
│   ├── lib/
│   │   ├── scoring/            ⭐ MOTOR DE CLASSIFICAÇÃO
│   │   │   ├── rank.ts         posição → pontos, com empates
│   │   │   ├── wod1.ts         total de cargas
│   │   │   ├── wod2.ts         2A / 2B / 2C
│   │   │   ├── wod3.ts         tempo, CAP e política de DNF
│   │   │   ├── overall.ts      classificação geral
│   │   │   └── build.ts        ponto único de entrada
│   │   ├── supabase/           clientes browser · server · service role
│   │   ├── demo/               20 duplas fictícias
│   │   ├── validation.ts       schemas Zod
│   │   ├── wods.ts             prescrição dos WODs e programação
│   │   └── time.ts             MM:SS ⇄ segundos
│   ├── services/               snapshot · exportação · auditoria
│   ├── hooks/                  useLiveSnapshot (realtime)
│   ├── types/domain.ts         modelo de domínio
│   └── styles/globals.css      ⭐ DESIGN SYSTEM DA MARCA
├── supabase/
│   ├── migrations/             6 migrations SQL
│   ├── seed.sql                evento + 20 duplas
│   └── tests/rls.test.sql      verificação do RLS
├── tests/                      63 testes (Vitest)
└── docs/regras-pendentes.md    ⚠️ o que ainda falta a organização decidir
```

---

## Identidade visual

Derivada do **Manual da Marca Nação Club**.

| Token | Cor | Uso |
|---|---|---|
| `--nacao-navy` | `#022B57` | fundo, header, títulos, peso |
| `--nacao-blue` | `#0169E9` | CTA, botões, links, estado ativo |
| `--nacao-sky` | `#3A86FF` | gráficos, destaques secundários |
| `--nacao-cyan` | `#20C4FA` | highlights, badges, indicador AO VIVO |
| `--nacao-white` | `#FFFFFF` | cards, texto sobre escuro, contraste |

As cinco cores **não** são usadas de forma indiscriminada: cada uma tem um
papel fixo, declarado em `src/styles/globals.css`.

**Tipografia.** O manual especifica **Gotham** (títulos) e **Gotham Rounded
Light** (corpo) — fontes licenciadas e não redistribuíveis. O sistema usa Gotham
quando ela está instalada e cai em **Montserrat** e **Nunito Sans**, as
alternativas web mais próximas em geometria. Toda a aplicação referencia
`--font-display` e `--font-body`, então trocar pela fonte oficial é adicionar um
`@font-face` — nada mais muda.

**Logomarca.** Não é redesenhada em lugar nenhum. Salve o arquivo oficial em
`public/logo-nacao-club.svg` e o componente `BrandLogo` passa a usá-lo
automaticamente. Até lá, exibe uma assinatura tipográfica (NAÇÃO / filete /
C L U B) que respeita a construção do manual. Detalhes em `public/LEIA-ME.md`.

**Elementos gráficos.** As linhas concêntricas do manual viram `WaveField`; o
céu de Brasília vira o gradiente atmosférico do `body`. Ambos em opacidade
baixa, atrás do conteúdo.

---

## Regras de cálculo

### WOD 1 — STRENGTH · CAP 15'

```
0–5 min    1RM Strict Press
5–10 min   3RM Back Squat
10–15 min  5RM Deadlift
```

| Prova | O quê | Critério |
|---|---|---|
| 1A | 1RM Strict Press | soma dos dois atletas |
| 1B | 3RM Back Squat | soma dos dois atletas |
| 1C | 5RM Deadlift | soma dos dois atletas |
| **1D** | **Total de cargas** | **maior total = melhor posição** |

```
TOTAL = SP(a1) + SP(a2) + BS(a1) + BS(a2) + DL(a1) + DL(a2)
```

A pontuação do WOD 1 vem de **1D**. 1º = 1 ponto, 2º = 2 pontos, …

### WOD 2 — ENDURANCE · AMRAP 22'

Atleta 1 inicia no **Shuttle Run** (500 m = 10 × 50 m); atleta 2 inicia na
**Assault Bike**. A dupla define a estratégia.

> **REGRA CRÍTICA.** A troca do atleta da corrida só pode ocorrer a cada
> **500 m** (500, 1000, 1500, 2000 …). Nunca em 300, 700 ou 1200 m.
>
> Isso é validado em **três camadas**: no formulário, no schema Zod e como
> `CHECK` no PostgreSQL. Um valor inválido não entra no banco nem por chamada
> direta à API.

| Prova | O quê | Critério |
|---|---|---|
| 2A | KM de corrida | maior = melhor |
| 2B | KM de assault bike | maior = melhor |
| 2C | Soma dos KM | maior = melhor |

```
PONTUAÇÃO DO WOD 2 = Pts 2A + Pts 2B + Pts 2C
```

### WOD 3 — METCON · FOR TIME · CAP 20:00

```
1.  120 m Burpee Broad Jumps
2.  120 Box Jump Over
3.   60 m Sandbag Walking Lunge     M 20 kg   · F 10 kg
4.  240 m 2DB Farm Carry            M 50 lb   · F 35 lb  (cada dumbbell)
5.  120 Wall Ball                   M 20 lb   · F 14 lb
6.  120 m Burpee Broad Jumps
```

Menor tempo válido = melhor posição. O juiz digita `14:32`; o sistema converte
para 872 segundos.

Quem não concluir grava **CAP = 20:00** e o **volume concluído**.
⚠️ O critério de ordenação dos incompletos **não foi inventado** — veja
[`docs/regras-pendentes.md`](docs/regras-pendentes.md#3-ordenação-de-quem-não-concluiu-o-wod-3).

### Classificação geral

```
TOTAL = Pts WOD 1 + Pts WOD 2 + Pts WOD 3      ·      menor total vence
```

Exemplo: WOD 1 = 2, WOD 2 = 4, WOD 3 = 1 → **TOTAL = 7**.

**Empates:** duplas com a mesma pontuação recebem a **mesma posição** e a tela
mostra `EMPATE`. Nenhum critério de desempate é aplicado automaticamente.

**Resultado parcial:** a ordenação considera primeiro **quantos WODs a dupla já
tem pontuados**, e só depois o total. Sem isso, uma dupla com 1 WOD lançado
apareceria na frente de quem já fez 3. É uma regra de integridade de dado, está
documentada e é confirmável.

**Desclassificada:** fica fora do ranking, mas continua visível na listagem.

### Categorias

O evento tem três: **Dupla Masculina**, **Dupla Feminina** e **Dupla Mista**.

Ao filtrar por uma delas, a posição exibida é recalculada **dentro da
categoria** e a tela diz isso com todas as letras ("Classificação da
categoria"). Nas tabelas e nos chips de filtro aparece a forma curta
(Masculina · Feminina · Mista), porque ali o contexto já deixa claro que se
trata de duplas.

---

## Configurar o Supabase

### 1. Criar o projeto

[supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
Anote a senha do banco. Escolha a região mais próxima (`sa-east-1`, São Paulo).

### 2. Aplicar as migrations

**Opção A — SQL Editor (sem instalar nada):** abra o SQL Editor do projeto e
cole o conteúdo de cada arquivo, **na ordem**:

```
supabase/migrations/20260901000001_schema.sql     tabelas, tipos, índices
supabase/migrations/20260901000002_scoring.sql    motor de classificação
supabase/migrations/20260901000003_views.sql      modelo de leitura
supabase/migrations/20260901000004_rls.sql        segurança
supabase/migrations/20260901000005_realtime.sql   realtime e permissões
supabase/migrations/20260901000006_audit.sql      auditoria
supabase/seed.sql                                 evento + 20 duplas
```

**Opção B — CLI:**

```bash
npx supabase link --project-ref SEU_REF
npx supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql
```

### 3. Variáveis de ambiente

Em **Settings → API**, copie os valores para o `.env.local`:

```bash
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=https://athx.nacaoclub.com.br
```

> A **anon key** pode circular no navegador: toda autorização está no RLS.
> A **service role key** nunca recebe o prefixo `NEXT_PUBLIC_` e nunca vai para
> o frontend.

### 4. Criar o usuário administrador

**Authentication → Users → Add user**: informe e-mail e senha e marque
*Auto Confirm User*.

Depois, no SQL Editor, autorize essa conta:

```sql
insert into admin_users (user_id, email, name)
select id, email, 'Nome da Pessoa'
from auth.users
where email = 'voce@nacaoclub.com.br';
```

> **Só quem está em `admin_users` pode escrever.** Ter conta no Supabase não
> basta — é isso que `athx_is_admin()` verifica em toda policy de escrita.
> Repita para cada pessoa da organização.

### 5. Conferir o Realtime

**Database → Replication** → a publicação `supabase_realtime` deve listar
`teams`, `wod1_results`, `wod2_results`, `wod3_results`, `wod_results`,
`event_settings` e `events`. A migration `…_realtime.sql` já faz isso.

### 6. Verificar a segurança

```bash
psql "$DATABASE_URL" -f supabase/tests/rls.test.sql
```

Imprime PASSOU/FALHOU para cada regra: o público lê duplas, **não** vê rascunho,
**não** escreve; um autenticado fora de `admin_users` **não** escreve; o admin
vê rascunho e escreve. Roda dentro de uma transação com `ROLLBACK` — não altera
nada.

---

## Deploy

### Vercel

1. **Add New → Project** e importe o repositório.
2. **Root Directory: `athx`** ← o repositório guarda mais de um produto; sem
   isso o build não encontra o `package.json`.
3. Framework: Next.js (detectado sozinho).
4. Em **Environment Variables**, adicione as quatro variáveis do passo 3 acima
   — com `NEXT_PUBLIC_DEMO_MODE=false` e `NEXT_PUBLIC_SITE_URL` apontando para o
   domínio final.
5. **Deploy.**

Depois de publicar, abra `/qr`, confira se o endereço do QR Code é o de
produção (e não `localhost`) e baixe o PNG para os banners.

### Checklist do dia anterior

- [ ] as 20 duplas cadastradas com **nome dos dois atletas**
- [ ] **categoria** de cada dupla confirmada — Dupla Masculina, Dupla Feminina
      ou Dupla Mista (o seed cria todas como Mista)
- [ ] baterias conferidas (1 e 2)
- [ ] critério de desempate decidido → `/admin/settings`
- [ ] política do WOD 3 para quem não concluir decidida → `/admin/settings`
- [ ] altura do Box Jump Over definida → `src/lib/wods.ts`
- [ ] logo oficial em `public/logo-nacao-club.svg`
- [ ] QR Code impresso apontando para o domínio de produção
- [ ] `/display` aberto no navegador do telão, em tela cheia
- [ ] login de cada pessoa da organização testado

---

## Como usar no dia do evento

### Lançar um WOD

1. `/admin/wod/1` (ou 2, ou 3)
2. escolha a **bateria** → a tela mostra só aquelas ~10 duplas
3. digite os resultados — o total é calculado enquanto você digita
4. **SALVAR RESULTADOS** → grava como rascunho; o público ainda não vê
5. confira
6. **PUBLICAR RANKING** → confirma, recalcula e o público vê na hora
7. repita para a bateria 2

**WOD 1:** seis campos por dupla (3 levantamentos × 2 atletas). O total sai sozinho.

**WOD 2:** corrida e bike. A corrida **só aceita múltiplos de 0,5 km** — se
digitar 3,2 o sistema recusa e explica por quê. A soma sai sozinha.

**WOD 3:** digite o tempo como `14:32`. Se a dupla não concluiu, desmarque
*Concluiu?* — o campo de tempo trava, o CAP de 20:00 é gravado e o campo de
volume abre.

### Corrigir depois de publicar

Volte na tela do WOD, corrija e publique de novo. A auditoria registra
*"quem alterou o quê, de qual valor para qual"*.

Se o resultado estiver **TRAVADO**, vá em `/admin/results` → *Destravar*,
informe o motivo (obrigatório) e corrija. O destravamento também é auditado.

### Antes do pódio

`/admin/results` mostra lado a lado **o que o público vê** e a **prévia com
rascunhos**, lista os **empates pendentes** e exporta em **CSV**, **JSON** ou
**PDF** (via imprimir → salvar como PDF, em A4 paisagem).

### Se algo der errado

`/admin/settings` → **MAINTENANCE MODE**. O público passa a ver uma tela de
manutenção da Nação em vez de um erro, e a organização continua trabalhando.

---

## Comandos

```bash
npm run dev         # desenvolvimento
npm run build       # build de produção
npm start           # servidor de produção
npm test            # 63 testes
npm run typecheck   # TypeScript estrito
npm run lint        # ESLint
```

---

## Testes

**63 testes** cobrindo:

| Arquivo | O que verifica |
|---|---|
| `wod1.test.ts` | soma de cargas (o caso 930 kg do enunciado), empates, DRAFT vs publicado, desclassificada |
| `wod2.test.ts` | soma 3,20 + 8,45 = 11,65 km, os três rankings, **a regra dos 500 m** |
| `wod3.test.ts` | 14:32 → 872 s, ordenação por tempo, CAP, **as três políticas de DNF** |
| `standings.test.ts` | classificação geral, empates, resultado parcial, filtro por categoria |
| `parity.test.ts` | **motor TypeScript × motor SQL** sobre 20 duplas |
| `search.test.ts` | busca por dupla, atleta, número, sem acento; filtro por categoria |
| `validation.test.ts` | schemas de lançamento e cadastro |
| `export.test.ts` | CSV e JSON |
| `supabase/tests/rls.test.sql` | RLS real, contra um PostgreSQL de verdade |

Realtime e Supabase Auth dependem de um projeto Supabase ativo e **não** têm
teste automatizado aqui — verifique-os pelo checklist acima.

---

## Acessibilidade

Contraste alto sobre o navy da marca; foco visível em tudo que é interativo;
tabelas com `<caption>` e `<th scope>`; filtros como `tablist` navegável por
setas; `aria-live` na busca e no indicador AO VIVO; link "pular para o
conteúdo"; `prefers-reduced-motion` respeitado.

**Nada depende só de cor:** o Top 3 tem posição escrita por extenso para leitor
de tela, empates trazem o rótulo `EMPATE` e o indicador ao vivo diz o estado em
texto.

---

## Segurança

- Público: **somente leitura**, e só de resultado homologado.
- Escrita: apenas para quem está em `admin_users` (RLS, não interface).
- Rascunho não vaza — nem por API, nem pelo websocket do Realtime.
- `SUPABASE_SERVICE_ROLE_KEY` nunca tem prefixo `NEXT_PUBLIC_`; o módulo que a
  lê é `server-only` e quebra o build se for importado no cliente.
- Resultado `LOCKED` não muda sem destravamento explícito, com motivo e
  auditoria.
- Auditoria por gatilho no banco: até alteração feita direto no painel do
  Supabase aparece no histórico.

---

## O que ainda falta decidir

👉 **[`docs/regras-pendentes.md`](docs/regras-pendentes.md)**

Nove itens que a especificação do evento não fechou. Para cada um: o que falta,
o que o sistema faz enquanto isso e onde ajustar. **Nada foi assumido em
silêncio.**
