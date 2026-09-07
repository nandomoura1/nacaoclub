# Time de especialistas da Nação Club

Oito especialistas que dão ao Claude o contexto e o método de gestão do
complexo esportivo Nação Club — sete moram aqui, e o CMO já vive na sua conta.
Cada um é uma **skill**: um manual de trabalho que o Claude carrega sozinho
quando a conversa entra no domínio dele.

## O time

| Skill | Papel | Aciona quando o assunto é |
|---|---|---|
| `nacao-club-brief` | **Chief of Staff** | Contexto geral, decisão que cruza áreas, priorização, reunião de liderança, "o que eu faço agora" |
| `cmo-nacao-club` | **CMO** | Marketing, conteúdo, redes, tráfego pago, campanhas, copy, posicionamento |
| `coo-nacao-club` | **COO** | Grade, espaços, escala, manutenção, fornecedores, segurança, processos |
| `cfo-nacao-club` | **CFO** | Preço, planos, DRE, margem por modalidade, inadimplência, investimento, unit economics |
| `cx-nacao-club` | **Experiência e Retenção** | Jornada do aluno, onboarding, churn, NPS, reclamação, cross-sell, indicação |
| `rh-nacao-club` | **Gente e Cultura** | Contratação, aula-teste, feedback, avaliação, clima, turnover |
| `eventos-nacao-club` | **Eventos** | Torneios, colônias, Celebration, patrocínio, produção, orçamento de evento |
| `dados-nacao-club` | **Dados** | KPIs, relatórios, coortes, ocupação, queries no QUEM CHEGOU? |

> `cmo-nacao-club` já existe como skill pessoal na conta e por isso **não é
> duplicada aqui** — duas skills com o mesmo nome brigam. As outras sete
> complementam ela.

## Agentes

Em `.claude/agents/`, para trabalho que vale isolar:

- **`conselho-nacao`** — reunião de diretoria. Traga uma decisão e receba a
  leitura de cada diretor, onde eles discordam, e uma recomendação fechada.
- **`analista-nacao`** — analista somente-leitura. Escava o banco do
  QUEM CHEGOU? e volta com números apurados, método e leitura.

## Como usar

**No Claude Code, dentro deste repositório:** carregam sozinhas. É só perguntar.
Para forçar uma específica: `/nacao-club-brief`, `/cfo-nacao-club`, etc.

**No claude.ai, no celular, no app — em qualquer lugar:** suba cada pasta como
skill pessoal em **Settings → Capabilities → Skills**. Aí o time viaja com você,
não só com o repositório.

Para gerar os `.zip` de upload:

```bash
cd .claude/skills
for s in */; do [ -d "$s" ] && zip -r "${s%/}.zip" "$s"; done
```

## Fonte única de verdade numérica

Todo número da Nação vive em
[`nacao-club-brief/references/numeros-da-casa.md`](nacao-club-brief/references/numeros-da-casa.md).

Os campos marcados `[A PREENCHER]` são de propósito: **nenhum especialista
pode inventar um número da casa.** Preencha e o time inteiro fica mais preciso
de uma vez.

Peça: *"vamos preencher os números da casa"* — o Claude conduz campo a campo.

## Trazendo o conhecimento do ChatGPT

Guia completo com os prompts de extração prontos:
[`docs/nacao/migracao-chatgpt.md`](../../docs/nacao/migracao-chatgpt.md).

## Como as skills evoluem

Elas são vivas. Quando o Claude errar o tom, o contexto ou um processo, diga
o que estava errado e peça pra gravar. Skill que não é corrigida envelhece.
