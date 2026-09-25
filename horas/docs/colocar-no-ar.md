# Colocar no ar — passo a passo

Tempo total: ~30 minutos. Não precisa instalar nada no computador.

Você vai criar **duas contas** (Supabase = banco de dados, Vercel = site) e
colar **cinco valores**. No fim, abre o link, cria o seu usuário e importa a
planilha.

---

## Parte 0 — O código na branch principal

A Vercel publica a branch `main`. O sistema está na branch
`claude/gifted-goldberg-eowh5b`: é preciso **juntar (merge) na `main`**
pelo Pull Request no GitHub (botão verde "Merge pull request").

---

## Parte 1 — Banco de dados (Supabase)

1. Acesse **supabase.com** → **Start your project** → entre com o GitHub ou e-mail da Nação.
2. **New project**:
   - *Organization*: crie "Nação Club".
   - *Project name*: `nacao-horas`.
   - *Database password*: clique **Generate a password** e **guarde num lugar seguro**
     (gerenciador de senhas). Prefira senha só com letras e números.
   - *Region*: **South America (São Paulo)**.
   - Clique **Create new project** e espere ~2 minutos.
3. No topo do projeto, clique **Connect**. Em *Connection string*:
   - Copie a do **Transaction pooler** (porta **6543**). Troque `[YOUR-PASSWORD]`
     pela senha do passo 2 e acrescente no final:
     `?pgbouncer=true&connection_limit=1` → este é o **DATABASE_URL**.
   - Copie a do **Session pooler** (porta **5432**), trocando a senha →
     este é o **DIRECT_URL**.

   > Não use a "Direct connection": no plano gratuito ela só funciona por IPv6,
   > e a Vercel não alcança.

---

## Parte 2 — Dois códigos secretos

Crie dois textos aleatórios (num gerenciador de senhas, ex. 1Password/Bitwarden,
use "gerar senha" só com letras e números):

| Nome | Tamanho | Para quê |
|---|---|---|
| **SESSION_SECRET** | 64 caracteres | Assina as sessões de login |
| **SETUP_TOKEN** | 32 caracteres | Libera a tela de primeiro acesso (uma vez só) |

No Mac/Linux, no Terminal: `openssl rand -hex 32` (SESSION_SECRET) e
`openssl rand -hex 16` (SETUP_TOKEN).

---

## Parte 3 — Site (Vercel)

1. Acesse **vercel.com** → **Sign Up** → **Continue with GitHub** (a conta
   dona do repositório `nacaoclub`).
2. **Add New… → Project** → em *Import Git Repository*, escolha `nacaoclub`
   (se não aparecer: *Adjust GitHub App Permissions* e libere o repositório).
3. Em **Configure Project**:
   - *Root Directory*: clique **Edit** e escolha **`horas`**.
   - *Framework Preset*: Next.js (automático). Não mexa em Build Command.
   - Abra **Environment Variables** e adicione:

     | Key | Value |
     |---|---|
     | `DATABASE_URL` | Transaction pooler (Parte 1) |
     | `DIRECT_URL` | Session pooler (Parte 1) |
     | `SESSION_SECRET` | Parte 2 |
     | `SETUP_TOKEN` | Parte 2 |

4. **Deploy**. Leva ~3 minutos (o build já cria as tabelas no banco).
5. Ao terminar, clique no link `https://….vercel.app`.

---

## Parte 4 — Primeiro acesso

1. O link abre a tela **Primeiro acesso**.
2. Cole o **SETUP_TOKEN**, informe seu nome, e-mail e crie sua senha (10+ caracteres).
3. O sistema cria áreas, modalidades, feriados e o seu usuário **Administrador**.
   Essa tela deixa de existir.
4. (Recomendado) Na Vercel, *Settings → Environment Variables*, apague o `SETUP_TOKEN`.

---

## Parte 5 — Deixar pronto para a equipe

1. **Administração → Usuários → Novo usuário** para cada coordenador
   (Maria · Nação Fit, Juliana · CrossFit, Rafa · Aulas Coletivas, Ramon · Futevôlei).
   Copie a senha provisória e envie por WhatsApp; no 1º acesso cada um cria a sua.
2. **Grade semanal → Importar planilha**: no Google Sheets, *Arquivo → Fazer
   download → Microsoft Excel (.xlsx)* e envie. Confira os nomes e o quadro
   de horas por semana contra o PADRÃO da HORAS MENSAIS. Confirme.
3. **Calendário → Gerar** a competência. Para comparar com a planilha de um
   mês já fechado, importe com vigência no início daquele mês (ex. 26/08).
4. **Cadastros → Feriados**: escolha a política de cada feriado (ex. 12/10).
5. Rode uma competência **em paralelo** com a planilha antes de desligá-la.

---

## Custos e limites (sem surpresa)

| Serviço | Grátis | Quando pagar |
|---|---|---|
| Supabase | Plano Free: 500 MB, suficiente por anos | O projeto gratuito **pausa após 7 dias sem uso** e não tem backup automático diário restaurável. Para uso real, o **Pro (US$ 25/mês)** tem backups diários |
| Vercel | Hobby | Os termos da Vercel limitam o Hobby a uso **não comercial**; para a Nação, o correto é o **Pro (US$ 20/mês)** |

Domínio próprio (ex. `horas.nacaoclub.com.br`): Vercel → *Settings → Domains*,
e um registro CNAME no provedor do domínio.

## Deu errado?

| Sintoma | Causa provável |
|---|---|
| Build falha em `prisma migrate deploy` | `DIRECT_URL` errada ou com a senha sem trocar |
| Site abre mas dá erro ao entrar | `DATABASE_URL` sem `?pgbouncer=true&connection_limit=1` |
| "Primeiro acesso desativado" | `SETUP_TOKEN` ausente ou com menos de 16 caracteres |
| Senha com `@ # / %` quebra a conexão | Gere uma senha do banco só com letras e números |
