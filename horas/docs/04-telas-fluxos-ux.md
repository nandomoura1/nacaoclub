# 04 · Mapa de telas, fluxos e UX

Itens **2, 3 e 10** da entrega.

---

## 1. Princípios de UX

1. **A tela inicial responde "o que precisa de mim agora?"** — não é um menu.
2. **Ação frequente = no máximo 4 toques.** Substituir professor no celular
   em < 20 s.
3. **Formulário é o último recurso.** Primeiro: card → ação → autocomplete
   → salvar. Campos opcionais escondidos em "mais detalhes".
4. **Toda exceção é visível na própria aula** (linha do tempo no card).
5. **Estado por cor + ícone + texto** — nunca só cor (acessibilidade e sol
   de Brasília na tela do celular).
6. Referências: Linear (velocidade, atalhos `⌘K`), Stripe (tabelas limpas,
   números em destaque), Notion (calma, espaço em branco).

### Identidade visual (Manual da Marca, Proposta 3)

| Token | Cor | Uso |
|---|---|---|
| navy | `#022B57` | Sidebar, títulos, texto forte |
| azul Nação | `#0169E9` | Ação primária, links, foco |
| azul claro | `#3A86FF` | Seleção, hover, gráficos |
| ciano | `#20C4FA` | Destaques, "hoje", badges informativos |
| branco | `#FFFFFF` | Superfícies |

Fundo `#F4F7FB` (neutro com "sangue azul", igual ao Quem Chegou?).
Tipografia **Gotham** (títulos, peso bold) / **Gotham Rounded Light** (corpo),
com fallback Montserrat / Nunito. Escudo "N" como ícone do app e favicon.
As ondas do manual aparecem **só** no login e em estados vazios — nunca
atrás de dado.

Cores de **modalidade** são configuráveis no cadastro (paleta sugerida com
contraste AA garantido); cores de **status** são fixas:

| Status | Badge |
|---|---|
| Prevista | contorno cinza-azulado · `○` |
| Realizada | verde · `✓` |
| Substituída | azul Nação · `⇄` |
| Extra | ciano · `＋` |
| Cancelada | cinza riscado · `⊘` |
| Falta / Férias / Atestado / Folga | âmbar · ícone próprio |
| Pendente de professor | vermelho · `!` (pulsa na tela Hoje) |
| Aguardando decisão (feriado) | roxo · `?` |

---

## 2. Mapa de telas

```
LOGIN
 └─ APP (sidebar desktop · bottom-nav mobile)
    ├─ HOJE ............................ (home do coordenador; mobile-first)
    ├─ DASHBOARD ....................... (home do admin/consulta)
    │   └─ Dashboard financeiro ........ (finance.view)
    ├─ CALENDÁRIO (mês | semana | dia | lista)
    │   └─ Drawer da aula ← abre de qualquer lugar
    ├─ PENDÊNCIAS
    │   ├─ Aulas sem professor
    │   ├─ Feriados a decidir
    │   ├─ Confirmações pendentes
    │   └─ Conflitos de grade
    ├─ GRADE SEMANAL (editor DnD, vigência)
    ├─ PROFESSORES
    │   └─ Perfil: dados · modalidades · valores* · vínculos · extrato · histórico
    ├─ AUSÊNCIAS (férias/afastamentos em lote)
    ├─ FECHAMENTO
    │   ├─ Competência: tabela consolidada + aprovações por área
    │   └─ Extrato do professor
    ├─ RELATÓRIOS (horas, custo*, comparativo, exportação)
    ├─ NOTIFICAÇÕES (sino)
    └─ ADMIN
        ├─ Modalidades · Áreas de coordenação · Centros de custo · Unidades
        ├─ Tipos de aula · Cargos · Níveis · Tipos de vínculo
        ├─ Feriados
        ├─ Tabelas de valor* · Regras de pagamento*
        ├─ Usuários e permissões
        ├─ Importação de planilha
        ├─ Histórico de alterações (auditoria)
        └─ Integrações (tokens, webhooks, IDs externos)

* só com finance.view / finance.edit_rates
```

### 2.1 Telas-chave

**HOJE** (coordenador, celular)
```
┌──────────────────────────────┐
│ Qui, 24 set      🔔 3        │
│ ┌──────────────────────────┐ │
│ │ ! 2 aulas sem professor  │ │  ← banner vermelho só se houver
│ └──────────────────────────┘ │
│ [Hoje] [Amanhã] [Semana]     │
│                              │
│ 05:00 ─────────────────────  │
│ ▌HYROX       Rafael    60′ ○ │
│ ▌CROSSFIT    Eliseu    60′ ○ │
│ 06:00 ─────────────────────  │
│ ▌FUNCIONAL   — sem prof. — ! │
│ ...                          │
│                     ( ＋ )   │  ← aula extra
└──────────────────────────────┘
```
Toque no card → **bottom sheet** da aula:
`[⇄ Substituir] [✕ Falta] [⊘ Cancelar] [🕑 Horário] [⋯]` + linha do tempo.

**DASHBOARD** — 8 cards (Professores ativos · Aulas hoje · Horas previstas
no mês · Horas realizadas · Substituições · Faltas · Aulas sem professor ·
Pendências de aprovação), depois duas colunas: **Próximas aulas** e
**Pendências** em linguagem humana ("3 aulas aguardando substituto",
"2 professores de férias", "Lutas ainda não aprovou setembro").

**GRADE SEMANAL** — colunas SEG…DOM, linhas de 30 min (05:00–23:00, com
faixas vazias colapsadas). Cards coloridos por modalidade. Arrastar move;
`Alt`+arrastar duplica; menu do card: editar, trocar professor, copiar para
outros dias, encerrar. **Todo salvamento pergunta a data de vigência**
(padrão: próxima segunda) e mostra o impacto: *"Afeta 12 aulas já geradas
de outubro; 2 têm exceção e irão para revisão."* Seletor "ver grade em
[data]" navega no histórico de versões.

**CALENDÁRIO** — mês (densidade: pontos coloridos + contador; clique no dia
abre lista), semana (igual à grade, mas com ocorrências reais e status),
lista (tabela filtrável). Filtros persistentes: professor, modalidade, área,
centro de custo, status. Busca `⌘K`: "rafael", "hyrox 15/09".

**AUSÊNCIAS** — wizard em 3 passos: professor + tipo + intervalo →
lista das aulas afetadas agrupada por semana ("17 aulas") com substituto
sugerido pré-preenchido → confirmar. Ações em lote: "cancelar todas",
"deixar pendentes", "João em todas as HYROX".

**FECHAMENTO** — cabeçalho com a trilha de status da competência e chips
por área (✓ Cross & HYROX · ⏳ Lutas · ✓ Raquetes). Tabela:
`Professor | Modalidade | Previstas | Realizadas | Substituições | Ausências | Canceladas | Extras | Ajustes | Total` (+ `Valor` se permitido).
Linha expande por modalidade; clique no nome abre o **extrato**.
Botões conforme papel: *Aprovar minha área* · *Iniciar revisão
administrativa* · *Fechar competência* · *Exportar*.

**EXTRATO DO PROFESSOR** — estilo extrato bancário: data · modalidade ·
hora · evento · ±horas; rodapé com os totais de
[03 §3](03-regras-de-negocio.md#3-cálculo-de-horas-o-ledger) e, se
permitido, valor-hora por modalidade, adicionais e valor bruto. Exporta PDF.

**IMPORTAÇÃO** — upload XLSX/CSV → mapeamento de colunas com auto-detecção
("Prof.", "Professor", "Instrutor" → Professor) → **preview** com cada linha
marcada ✓/⚠/✕ (professor não encontrado → "criar"; modalidade nova →
"criar"; duplicada → "ignorar") → importar como grade com vigência escolhida.

**HISTÓRICO DE ALTERAÇÕES** — timeline filtrável por usuário, entidade,
período, tipo; cada item em português: *"25/09/2026 14:32 — Carla alterou o
professor da aula HYROX 05:00 de 28/09: Eliseu → João. Motivo: férias."*

---

## 3. Fluxos por perfil

### 3.1 Coordenador — substituir no celular (meta < 20 s)

```
abre o app (sessão lembrada, cai direto em HOJE)          ~3 s
  → toca no card "HYROX 05:00 Rafael"                     1 toque
  → [⇄ Substituir]                                        1 toque
  → lista já filtrada: habilitados em HYROX e livres
    às 05:00 (João no topo — já cobriu essa aula)         1 toque
  → motivo pré-selecionado "Falta" (trocar é opcional)
  → [Salvar]                                              1 toque
toast: "João substitui Rafael · HYROX 05:00 · desfazer"
```
4 toques. Atualização otimista; "desfazer" por 10 s gera `REVERSAO`.

### 3.2 Coordenador — mês típico

```
Dia 1   recebe notificação "Outubro gerado: 312 aulas, 318h"
Durante registra só exceções (Hoje / Calendário / Ausências)
        resolve o que aparece em Pendências
Fim     abre Fechamento → confere a própria área → [Aprovar minha área]
```

### 3.3 Admin — ciclo do mês

```
Grade padrão (uma vez; ajustes com vigência)
  → [Gerar mês] (ou automático no dia 25 do mês anterior)
  → decide feriados pendentes
  → acompanha Dashboard
  → envia competência para revisão
  → acompanha chips das áreas / cobra quem falta
  → revisão administrativa (diff contra mês anterior, pendências = 0)
  → [Fechar competência] → snapshot
  → Exportar XLSX/CSV para folha
```

### 3.4 DP / Financeiro (consulta)

Fechamento (somente leitura) → Relatórios → exporta. Vê valor só se tiver
`finance.view`.

### 3.5 Professor (Fase 2)

Login → "Meu mês": extrato em tempo real → [Contestar] numa linha → abre
pendência para o coordenador.

---

## 4. Responsivo

| Breakpoint | Navegação | Grade/Calendário |
|---|---|---|
| ≥ 1280 | Sidebar fixa | 7 colunas |
| 768–1279 | Sidebar recolhida | 7 colunas compactas |
| < 768 | Bottom-nav (Hoje · Calendário · Pendências · Fechamento · Mais) | Um dia por vez com swipe; editar grade é desktop-first, mas funciona |

Alvos de toque ≥ 44 px, modais viram bottom sheets, tabelas viram cards.

## 5. As perguntas do critério de sucesso → onde se respondem

| Pergunta | Onde | Cliques |
|---|---|---|
| Quantas horas o Rafael trabalhou em setembro? | `⌘K` "rafael" → extrato | 2 |
| Quem substituiu o Eliseu no dia 21? | Calendário 21/09 → aula (ou filtro "Substituídas") | 2 |
| Quanto de hora-aula tivemos no CrossFit este mês? | Relatórios → Horas por modalidade | 2 |
| Quais professores estão de férias? | Dashboard → card/pendência "de férias" | 1 |
| Aulas da próxima semana sem professor? | Pendências → Aulas sem professor (filtro semana) | 1 |
| Qual coordenador não aprovou? | Fechamento → chips por área | 1 |
| Diferença de horas agosto × setembro? | Relatórios → Comparativo | 2 |
| Custo previsto × realizado por modalidade? | Dashboard financeiro | 1 |
