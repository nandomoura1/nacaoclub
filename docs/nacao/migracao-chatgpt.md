# Migrando o conhecimento do ChatGPT para o Claude

O que o ChatGPT sabe sobre você se divide em **duas coisas muito diferentes**,
e elas têm destinos diferentes aqui. Confundir as duas é o erro que faz a
migração parecer que "não funcionou".

| O que é | Exemplo | Onde vive no Claude |
|---|---|---|
| **Memória** — fatos curtos e duráveis sobre você | "Sou gestor da Nação Club", "moro em Brasília" | Memória do Claude (importador oficial) |
| **Conhecimento operacional** — playbooks, processos, números, calendário | Régua de churn, tabela de planos, calendário de eventos | **Skills** (`.claude/skills/`) |

> Memória é uma agenda de fatos. Skill é um manual de como trabalhar.
> O grosso do que o ChatGPT sabe sobre a Nação é **manual**, não agenda.

---

## Parte 1 — Memórias pessoais (importador oficial)

O Claude tem um importador nativo que faz isso inteiro, com filtro de
privacidade automático.

**Passo 1.** No ChatGPT, rode este prompt:

```
Export all of my stored memories and any context you've learned about me from past conversations. Preserve my words verbatim where possible, especially for instructions and preferences.

## Categories (output in this order):

1. **Instructions**: Rules I've explicitly asked you to follow going forward — tone, format, style, "always do X", "never do Y", and corrections to your behavior. Only include rules from stored memories, not from conversations.

2. **Identity**: Name, age, location, education, family, relationships, languages, and personal interests.

3. **Career**: Current and past roles, companies, and general skill areas.

4. **Projects**: Projects I meaningfully built or committed to. Ideally ONE entry per project. Include what it does, current status, and any key decisions. Use the project name or a short descriptor as the first words of the entry.

5. **Preferences**: Opinions, tastes, and working-style preferences that apply broadly.

## Format:

Use section headers for each category. Within each category, list one entry per line, sorted by oldest date first. Format each line as:

[YYYY-MM-DD] - Entry content here.

If no date is known, use [unknown] instead.

## Output:
- Wrap the entire export in a single code block for easy copying.
- After the code block, state whether this is the complete set or if more remain.
```

**Passo 2.** Copie a saída e cole em
**claude.ai → Settings → Capabilities → "Import memory from other AI providers"**
(atalho: <https://claude.ai/settings/capabilities?open_memory_import=true>).

O importador filtra sozinho categorias sensíveis (saúde, finanças pessoais,
identificadores) e nunca sobrescreve memória existente — só acrescenta.

> **Por que não fazer isso aqui na sessão?** As sessões do Claude Code na web
> não têm as ferramentas de memória habilitadas. Se numa sessão futura elas
> aparecerem, a skill `import-memory` faz o processo por aqui também.

---

## Parte 2 — Conhecimento da Nação (o que realmente importa)

É aqui que mora o valor. Rode **cada um** dos prompts abaixo no ChatGPT (em
conversas separadas, para não misturar) e cole a resposta numa sessão do Claude
dizendo: *"incorpora isso nas skills da Nação"*.

Cada bloco de resposta vira arquivo de referência dentro da skill do
especialista correspondente.

### 2.1 — Operação → `coo-nacao-club`

```
Você conhece a Nação Club, complexo esportivo que eu gerencio em Brasília.
Liste TUDO que você sabe sobre a OPERAÇÃO dela: espaços e capacidades, grade de
aulas e horários, horários de pico, escala de professores, fornecedores,
manutenção, processos, checklists, regras internas e problemas operacionais
recorrentes que já discutimos.

Formato: tópicos objetivos, um fato por linha. Não invente nada — se não souber
um dado, escreva "não sei". Marque com [INCERTO] o que for suposição sua.
```

### 2.2 — Financeiro e comercial → `cfo-nacao-club`

```
Liste TUDO que você sabe sobre o FINANCEIRO e o COMERCIAL da Nação Club:
planos e preços, ticket médio, custos, margens, inadimplência, número de alunos,
metas, política de desconto, patrocínios e qualquer número que eu já tenha te
passado.

Formato: tópicos, um fato por linha, com a data aproximada quando souber. Não
invente nenhum número. Marque [INCERTO] o que for suposição.
```

### 2.3 — Alunos e retenção → `cx-nacao-club`

```
Liste TUDO que você sabe sobre os ALUNOS da Nação Club e sobre RETENÇÃO:
perfil do público, jornada, motivos de cancelamento, reclamações recorrentes,
scripts de atendimento que criamos, ações de retenção testadas e o que
funcionou ou não.

Formato: tópicos, um fato por linha. Não invente. Marque [INCERTO] as suposições.
```

### 2.4 — Equipe → `rh-nacao-club`

```
Liste TUDO que você sabe sobre a EQUIPE da Nação Club: estrutura, papéis,
professores por modalidade, modelo de contratação, dinâmicas do time, desafios
de gestão de pessoas e decisões que já tomamos juntos sobre isso.

Formato: tópicos, um fato por linha. Use apenas o primeiro nome ou o cargo das
pessoas — não inclua dados pessoais, contato ou informação sensível de ninguém.
Marque [INCERTO] as suposições.
```

### 2.5 — Eventos → `eventos-nacao-club`

```
Liste TUDO que você sabe sobre os EVENTOS da Nação Club: eventos já realizados,
resultados, número de participantes, custos, patrocinadores, o que deu certo,
o que deu errado, formatos, regulamentos e aprendizados.

Formato: tópicos, um fato por linha, com data quando souber. Não invente números.
Marque [INCERTO] as suposições.
```

### 2.6 — Marketing → `cmo-nacao-club`

```
Liste TUDO que você sabe sobre o MARKETING da Nação Club: campanhas realizadas
e resultados, performance de conteúdo, tráfego pago (verba, CPL, conversão),
posicionamento, público, concorrentes e aprendizados sobre o que engaja a
comunidade da Nação.

Formato: tópicos, um fato por linha. Não invente métricas. Marque [INCERTO] as
suposições.
```

### 2.7 — Decisões e histórico → `nacao-club-brief`

```
Liste as DECISÕES IMPORTANTES que eu tomei sobre a Nação Club e que você
acompanhou, com o contexto de cada uma: o que foi decidido, por quê, quando e
qual foi o resultado. Inclua também projetos em andamento e ideias que ficaram
engavetadas.

Formato: uma decisão por bloco, ordem cronológica. Não invente.
```

---

## Parte 3 — O que fazer com o material colado

Ao colar cada bloco, peça: **"incorpora isso nas skills da Nação"**. O Claude vai:

1. Separar **fato** de **suposição** — tudo marcado `[INCERTO]` vira pergunta
   pra você confirmar, nunca vira verdade em arquivo;
2. Mandar números para `nacao-club-brief/references/numeros-da-casa.md`;
3. Mandar processos e playbooks para o `references/` da skill do especialista;
4. Descartar dado pessoal sensível de terceiros;
5. Mostrar o que mudou antes de commitar.

---

## Higiene — o que NÃO trazer

Não cole aqui, nem deixe entrar em arquivo do repositório:

- Dados pessoais de alunos ou colaboradores (nome completo, CPF, telefone,
  endereço, informação de saúde) — o sistema é regido por LGPD e as skills
  vão para o Git;
- Senhas, tokens, credenciais do Tecnofit ou de qualquer sistema;
- Contratos e valores individuais de colaboradores.

Números **agregados** (ticket médio, churn, headcount) são bem-vindos.
Dados **individuais** ficam no Tecnofit, que é o lugar deles.

---

## Cadência recomendada

Isso não é projeto de uma tarde. Sugestão:

| Quando | O quê |
|---|---|
| Hoje | Parte 1 (memórias) + bloco 2.7 (decisões) |
| Esta semana | 2.2 (financeiro) e 2.3 (retenção) — maior impacto |
| Próxima semana | 2.1, 2.4, 2.5, 2.6 |
| Contínuo | Toda decisão nova, peça: "atualiza a skill com isso" |

**As skills são vivas.** Elas melhoram cada vez que você corrige uma resposta.
Quando o Claude errar o tom ou o contexto, diga o que estava errado e peça pra
gravar — é assim que o time de especialistas fica bom de verdade.
