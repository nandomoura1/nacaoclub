# Colocar o NAÇÃO ATHX no ar

Guia direto, do zero até você lançando resultados de verdade.
**Tempo: ~20 minutos.** Tudo em plano gratuito.

São duas contas: **Supabase** (guarda os dados) e **Vercel** (hospeda o site).

---

## Parte 1 — Supabase (o banco) · ~8 min

### 1.1 Criar o projeto

1. Entre em **[supabase.com](https://supabase.com)** → *Start your project*
2. Login com GitHub ou e-mail
3. **New project**
   - **Name:** `nacao-athx`
   - **Database Password:** clique em *Generate a password* e **guarde essa senha**
   - **Region:** `South America (São Paulo)` — o mais perto de Brasília
4. **Create new project** e espere ~2 minutos

### 1.2 Instalar o banco (uma colagem só)

1. Menu da esquerda → **SQL Editor**
2. **New query**
3. Abra o arquivo **`athx/supabase/setup-completo.sql`** deste repositório,
   copie **tudo** e cole na janela
4. **RUN** (ou `Ctrl+Enter`)

Deve aparecer, no rodapé:

```
NAÇÃO ATHX — banco instalado com sucesso
Duplas cadastradas: 20
```

> Pode rodar de novo quantas vezes quiser. Não duplica nada e não apaga
> resultado já lançado.

### 1.3 Criar o seu usuário

1. Menu da esquerda → **Authentication** → **Users**
2. **Add user** → *Create new user*
   - **Email:** o seu
   - **Password:** a que você vai usar para entrar no sistema
   - ✅ **marque "Auto Confirm User"** (sem isso o login não funciona)
3. **Create user**

### 1.4 Liberar o seu acesso de administrador

1. Volte ao **SQL Editor** → **New query**
2. Cole o conteúdo de **`athx/supabase/tornar-admin.sql`**
3. **Troque o e-mail e o nome** nas duas linhas marcadas
4. **RUN**

Deve aparecer `Acesso liberado para ...`.

> Ter conta no Supabase **não basta** para lançar resultados. Só quem está na
> tabela `admin_users` consegue escrever — é assim que o público fica
> impedido de mexer no ranking. Repita este passo para cada pessoa da
> organização.

### 1.5 Copiar as duas chaves

> O painel do Supabase muda de layout com frequência, e este é o passo em que
> as pessoas mais se perdem. Por isso vão três caminhos — use o que funcionar.

**Caminho 1 — pela URL (o mais garantido).**
Olhe a barra de endereço; ela está assim:

```
https://supabase.com/dashboard/project/abcdefghijklmnop
                                       └──────┬───────┘
                                        ID do seu projeto
```

Troque o final para `/settings/api`:

```
https://supabase.com/dashboard/project/SEU-ID/settings/api
```

Se não abrir, tente `/settings/api-keys`.

**Caminho 2 — botão "Connect".**
No topo da tela do projeto. Abra e procure a aba **App Frameworks → Next.js**.
Esse é o melhor caminho quando aparece: ele já mostra as variáveis com os
nomes exatos que usamos, prontas para copiar.

**Caminho 3 — menu lateral.**
Engrenagem no rodapé do menu da esquerda → **API** ou **API Keys**.

---

Você procura dois valores. Deixe a aba aberta, vai usar na Parte 2:

| O que é | Com o que se parece | Vira |
|---|---|---|
| **Project URL** | `https://abcdefghijklmnop.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL` |
| **Chave pública** | longa, começa com `eyJhbGci...` ou `sb_publishable_...` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

O rótulo da chave pública varia conforme a versão do painel: **anon public**,
**Publishable key** ou **Project API key**. Qualquer um deles é o certo.

> ⚠️ **NÃO use** nenhuma chave marcada como **`secret`**, **`service_role`** ou
> escondida atrás de um botão *Reveal*. Ela ignora todas as regras de
> segurança — com ela publicada no site, qualquer pessoa conseguiria alterar
> o ranking.

---

## Parte 2 — Vercel (o site) · ~8 min

### 2.1 Importar o projeto

1. Entre em **[vercel.com](https://vercel.com)** → login **com o GitHub**
2. **Add New** → **Project**
3. Encontre o repositório **`nandomoura1/nacaoclub`** → **Import**

### 2.2 Configurar (aqui mora o detalhe importante)

| Campo | O que preencher |
|---|---|
| **Framework Preset** | Next.js *(vem sozinho)* |
| **Root Directory** | ⚠️ clique em **Edit** e escolha **`athx`** |
| **Branch** | `claude/clever-allen-7ozkyk` |

> **O `Root Directory` é o passo que mais gente erra.** O repositório guarda
> mais de um produto; sem apontar para `athx`, o build não acha o projeto e
> falha.

### 2.3 Variáveis de ambiente

Ainda na tela de configuração, abra **Environment Variables** e adicione as
quatro:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_DEMO_MODE` | `false` |
| `NEXT_PUBLIC_SUPABASE_URL` | o *Project URL* do passo 1.5 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a chave *anon public* do passo 1.5 |
| `NEXT_PUBLIC_SITE_URL` | deixe `https://nacao-athx.vercel.app` por enquanto |

> `NEXT_PUBLIC_DEMO_MODE=false` é o que liga os dados reais. Se ficar `true`,
> o site mostra as 20 duplas fictícias e o painel fica em somente leitura.

### 2.4 Deploy

**Deploy** e espere ~2 minutos. A Vercel te dá um endereço parecido com
`https://nacao-athx.vercel.app`.

### 2.5 Acertar o endereço do QR Code

Agora que você sabe o endereço real:

1. Vercel → **Settings** → **Environment Variables**
2. Edite `NEXT_PUBLIC_SITE_URL` para o endereço que a Vercel te deu
3. **Deployments** → no último → menu `···` → **Redeploy**

Sem isso, o QR Code dos banners apontaria para o endereço errado.

---

## Parte 3 — Conferir se está tudo certo · ~4 min

Abra o seu endereço e teste nesta ordem:

- [ ] **`/`** abre e mostra **20 duplas** — sem a tarja amarela de demonstração
- [ ] **`/login`** → entre com o e-mail e a senha do passo 1.3
- [ ] **`/admin`** abre o painel *(se pedir login de novo, a senha está errada;
      se disser que a conta não está em `admin_users`, refaça o passo 1.4)*
- [ ] **`/admin/teams`** → edite a **Dupla 01**: coloque os nomes dos atletas e
      a categoria certa → **Salvar**
- [ ] volte em **`/`** e veja o nome aparecer
- [ ] **`/admin/wod/1`** → lance uma carga qualquer → **Salvar resultados** →
      **Publicar ranking**
- [ ] abra **`/leaderboard`** **no celular** e confirme que o resultado apareceu
- [ ] deixe o celular aberto, mude um valor no computador e publique:
      **a tela do celular tem que mudar sozinha** — é o tempo real funcionando
- [ ] **`/display`** em tela cheia (tecla `F11`) — é a tela do telão
- [ ] **`/qr`** → confirme que o endereço embaixo do código **não** é
      `localhost` → **Baixar QR Code**

Deu tudo certo? Está no ar.

---

## Antes do dia 12

- [ ] as **20 duplas** com o nome dos dois atletas
- [ ] a **categoria** de cada dupla conferida — Dupla Masculina, Dupla Feminina
      ou Dupla Mista *(a instalação cria todas como Mista)*
- [ ] as **baterias** (1 e 2) conferidas
- [ ] **login criado para cada pessoa** que vai lançar resultado (passos 1.3 e 1.4)
- [ ] decidir o **critério de desempate** → `/admin/settings`
- [ ] decidir o que fazer com **quem não concluir o WOD 3** → `/admin/settings`
- [ ] definir a **altura do Box Jump Over** → `src/lib/wods.ts`
- [ ] **logo oficial** em `athx/public/logo-nacao-club-white.svg`
- [ ] **QR Code impresso** nos banners
- [ ] **`/display`** aberto no computador do telão

---

## Se algo der errado

| O que aconteceu | O que fazer |
|---|---|
| Não acho as chaves / não existe "Settings → API" | O painel mudou de layout. Use a URL direta: `…/project/SEU-ID/settings/api` (passo 1.5) |
| Build falhou na Vercel | **Root Directory** não está como `athx` (passo 2.2) |
| Site abre com tarja amarela de demonstração | `NEXT_PUBLIC_DEMO_MODE` não está `false` |
| "Evento não encontrado" | Faltou rodar o `setup-completo.sql` (passo 1.2) |
| Login não entra | Faltou marcar **Auto Confirm User** no passo 1.3 |
| "Sua conta não está em admin_users" | Refaça o passo 1.4 com o e-mail certo |
| Celular não atualiza sozinho | Supabase → **Database** → **Replication** → confira se `supabase_realtime` lista as tabelas `wod1_results`, `wod2_results`, `wod3_results` |
| Precisa tirar o site do ar por uns minutos | `/admin/settings` → **MAINTENANCE MODE** |
| Deu confusão no ranking | `/admin/results` → **Recalcular** |

---

## Quanto custa

Zero, para o tamanho deste evento. O plano gratuito do Supabase e da Vercel
cobre 20 duplas e algumas centenas de pessoas acompanhando pelo celular com
folga.
