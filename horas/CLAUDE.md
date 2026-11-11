# Nação ADM (app `horas/`) — guia do projeto

Sistema de gestão interna da Nação Club (Brasília): Gestão de Horas dos professores,
Treinos, Condomínio, Financeiro, Marketing, Escalas de Trabalho 5x2, Gestão de Processos
e Universidade Nação. Interface e textos em **português do Brasil**.

Documentação de produto e regras: `docs/01..08-*.md`, colocar no ar: `docs/colocar-no-ar.md`,
segurança: `docs/09-seguranca.md`.

## Stack

- Next.js 15 (App Router, Server Actions) + React + Tailwind · TypeScript estrito.
- Prisma + PostgreSQL. Produção: **Supabase**, projeto `frhrxdasgfnzdrthjeoi`, schema **`horas`**,
  usuário da aplicação `nacao_app` (sem superuser, sem bypass de RLS).
- Arquivos: Supabase Storage, bucket privado `marketing` (upload direto do navegador por URL
  assinada; leitura por URL assinada de 1 h). Dev/testes: `STORAGE_FAKE=1`.
- Hospedagem: Vercel (repositório de deploy `nandomoura1/nacao-horas`, branch `main`).

## Rodar e testar (local)

```bash
service postgresql start          # banco local (role nacao/nacao, bancos nacao_horas e nacao_horas_test)
npm install && npx prisma generate
npx tsc --noEmit                  # tipos
npx vitest run                    # testes (unit + integração em Postgres real) — tudo verde antes de subir
rm -rf .next && npm run build     # build de produção
STORAGE_FAKE=1 ZAPI_FAKE=1 AI_FAKE=1 PORT=3100 npm start   # login dev: admin@nacaoclub.dev
```

## Fluxo de mudança (sempre nesta ordem)

1. Código + teste no repositório `nandomoura1/nacaoclub`, pasta `horas/` (branch de trabalho).
2. `npx tsc --noEmit`, `npx vitest run` e `npm run build` limpos.
3. **Migração de banco primeiro** em produção (Supabase), depois o código:
   - criar `prisma/migrations/<AAAAMMDDHHMMSS>_<nome>/migration.sql` (SQL idempotente: `IF NOT EXISTS`);
   - em produção, aplicar o mesmo SQL **qualificado com `horas.`**; tabela nova: `ALTER TABLE horas.x OWNER TO nacao_app;`
   - registrar em `horas._prisma_migrations` com o **sha256 do migration.sql** (checksum).
4. Commit e push na branch; deploy = aplicar o patch do commit em `nacao-horas/main`
   (`git format-patch -1` → `git am -p2 --3way`) e conferir o status do commit (Vercel `success`).
5. Mudança de dados em produção: mostrar antes o que muda (consulta), preferir desativar a excluir.

Commits: mensagem em português, explicando o porquê. Sem identificador de modelo de IA no texto.

## Regras que não se quebram

- **Dados pessoais** (telefone, e-mail, observações) só saem do servidor para quem tem
  `teacher.view_personal`. Na tela de escalas vai só `hasPhone`, nunca o número.
- Nunca versionar dado real sensível (CPF, conta bancária, salário) nem segredo/token;
  segredos só nas variáveis da Vercel. Nunca usar credencial colada em conversa.
- Toda função de serviço chamada por tela/ação começa com `assertCan(principal, '<permissão>')`
  (e escopo: área do coordenador, setor do líder). Middleware é só conveniência, não autorização.
- Toda alteração relevante grava `audit()` (tabela append-only, trigger bloqueia UPDATE/DELETE).
- Não excluir dado sem confirmação; preferir `active = false`.
- Não vincular usuário a professor só pelo nome.
- IA de marketing: nada de dado pessoal no prompt; publicação sempre com aprovação humana.
- Escalas: **não criar dados fictícios para cobrir posto descoberto** — sinalizar.

## Mapa do código

- `src/domain/**` — regras puras e testáveis (sem banco). Ex.: `domain/escalas/{calendar,engine,validate,rotation,fairness}.ts`.
- `src/server/services/*-service.ts` — casos de uso (permissão, transação, auditoria).
- `src/app/(app)/<módulo>/` — telas; `actions.ts` = Server Actions finas que chamam os serviços.
- `src/server/auth/` — sessão (cookie opaco + HMAC), senha (scrypt), permissões/papéis (`permissions.ts`).
- `tests/unit`, `tests/integration` (banco real, cada arquivo cria seus dados).

## Decisões de negócio já tomadas (não reverter sem pedir)

**Permissões das Escalas 5x2**: Líder e Coordenador veem e **geram** escalas de **todos os setores**
(`ws.all_sectors`); aprovar/publicar (`ws.publish`), funcionamento da Nação e parâmetros legais
(`ws.admin`) ficam com a gestão (Administrador, DP/Financeiro). Escala aprovada/publicada fica travada; **Líder e
Coordenador podem "Reabrir para edição"** (motivo obrigatório, vai para o histórico) e a gestão aprova/publica de novo. Henrique (líder comercial) está na
equipe da Recepção sem horário fixo e fora da geração automática: escalado à mão para cobrir furos.

**Colaboradores**: `Teacher.team` = `PROFESSOR` (área fim, horista, grade de aulas) ou `ESCALA`
(área meio, escala 5x2). Listas da Gestão de Horas mostram só PROFESSOR.
**Documentos da equipe — CREF**: obrigatório só para cargo **Professor** (não estagiário); Instrutor, estagiário e
sem cargo = opcional; equipe ESCALA = não se aplica (`crefRule` em `domain/staff-docs.ts`).

**Escalas 5x2 — Recepção**
- Cada pessoa tem **horário fixo** de seg–sex; o **rodízio é só das folgas** ("Montar rodízio das folgas"):
  folga quinta ⇒ trabalha domingo; folga sexta ⇒ trabalha sábado; trabalha qui+sex ⇒ folga sáb+dom.
  No fim de semana trabalhado vale o turno de fim de semana do padrão.
- **Nunca mudar o horário de quem já trabalha no dia** para cobrir furo. Com ausência (férias,
  atestado): fim de semana primeiro — alguém do grupo "folga sáb+dom" assume o padrão de folga da
  pessoa ausente (sábado ⇒ folga na sexta; domingo ⇒ folga na quinta), no próprio horário de seg–sex.
  O que não der para cobrir assim vira **conflito sinalizado** para ajuste manual.
- Aprovar/publicar com conflito é permitido **com justificativa** (fica no histórico).

**Feriados (tela Escalas → Feriados)**: regra básica = **como sábado** (horário, equipe e postos de
sábado do setor). Recepção = horário próprio **07h–14h, 1 pessoa, rodízio** pelo histórico.
Lanchonete, Cozinha e Limpeza = como sábado. Todo feriado pede confirmação; dá para ajustar um
feriado específico (Nação inteira ou setor). Feriado no fim de semana usa o horário do próprio dia.
**FUNAP** (6x1, 44h, até 2h de intervalo) trabalha o feriado normalmente e só folga nos dias fixos.

**Simulação de grade** (Grade semanal → "Simular nova grade"; `schedule.edit`, nas áreas da pessoa): copia a grade de
uma data para um rascunho (`grade_simulations.items`, sem tocar na grade real), edita (aulas, troca de professor em
massa), compara horas atual × simulada (semana e competência 26→25, sem descontar feriados) e **implanta a partir de
uma data** com as mesmas operações da grade (`createSlotsTx`/`changeSlotTx`/`endSlotTx`, numa transação só, realinha
competências abertas; competência fechada bloqueia; aula mexida na grade real depois da simulação exige confirmação).

**Ausências de professor**: padrão "desconta" para tudo, menos **folga** (abonada); atestado desconta e o líder abona à mão quando for o caso. Lançadas antes de gerar a competência valem quando ela for gerada
(a prévia mostra as aulas pendentes e oferece "Gerar competência agora").

**Cobertura de ausência** (ficha do professor → Horas → "Cobrir férias / atestado"; `occurrence.exception`): escolhe a
ausência de outro professor e marca **em lote** as aulas que este cobre → cadeira vira SUBSTITUIDA (horas de substituição
para quem cobriu; quem faltou segue a regra da ausência). Registro `SUBSTITUICAO` com `after.cover = true`, desfazível;
aula cancelada pela ausência volta a acontecer. Só aulas já geradas (competência por gerar: avisa).

**Cronômetro da TV** (Treinos → Cronômetro da TV; permissão `workout.tv_timer`: Professor, Programação de treinos,
Coordenador, Admin): o professor programa no celular (For Time, AMRAP, EMOM, Tabata/intervalado, regressivo; sugestão
pelo bloco do treino do dia) e a TV (`/tv/<token>`) mostra WOD + timer. Estado em `tv_screens.timer` (início/pausas);
a TV consulta `/tv/<token>/timer` a cada 2 s e calcula o tempo localmente (sincroniza o relógio). Com timer, a TV
não recarrega sozinha (som/ritmo); "Tirar da TV" volta ao modo normal. Bipes exigem "Ativar som" uma vez na TV.
**Sequência** (`SEQUENCE`, até 10 partes, um Iniciar só, contagem inicial única): a TV passa de parte em parte e mostra
"parte X de N · a seguir"; For Time sem cap só pode ser a última; "Próxima parte" pula o restante da atual.
**Layout da TV com cronômetro** (aprovado em 03/11): relógio à **esquerda** (44%: tempo, fase, "a seguir", barra,
bolinhas dos rounds, partes da sequência) e treino à **direita** numa coluna (**só Força e WOD detalhados**; os demais blocos só com o tempo, como o warm-up — dia sem Força/WOD, ex. Futevôlei, mantém os blocos;
força e WOD completos; o bloco do timer ganha borda azul + "AGORA"). "Tela cheia" mostra só o relógio.

**Calendário de Marketing → "Texto para WhatsApp"**: texto do período visível (com os filtros), por tipo — campanhas, eventos,
datas e avisos, feriados (tarefas opcional), sem cancelados; editável; copiar, abrir no WhatsApp ou Z-API (`COMUNICADO`).
`calendarWhatsAppText` em `domain/marketing/calendar.ts`. Itens de vários dias (≥ 7: campanha longa, tema do mês, recesso) ficam **fora da grade**, numa linha "No período" acima dela, com as datas; a grade só tem o que é de um dia.
**Campanha de evento** (ligada a um evento, mesmo nome de um evento, ou tipo Evento) **não ocupa o período de divulgação**:
o evento aparece só no dia dele (sem evento cadastrado: a campanha aparece só no último dia, sem arrastar — `eventCampaignDay`).

**Kanban de Marketing**: estilo Trello (navegação lateral, colunas com rolagem própria,
"Adicionar um cartão"), imagens no cartão (PNG/JPG/WEBP/GIF ≤ 10 MB, sem SVG; a primeira é a capa),
link direto `?tarefa=<id>` e envio pelo WhatsApp (link exige login).

**Contratos** (menu Contratos; permissões `contract.view`/`contract.edit`/`contract.templates`, com Administrador e
DP/Financeiro): modelos com `{{campos}}` → contrato (rascunho editável) → envio congela o texto (SHA-256) e manda
um **link pessoal por WhatsApp** a cada parte (`/assinar/<token>`, público, fora do login) → a parte assina com
**código de 6 dígitos no WhatsApp** + "Eu, <nome da parte>, li e concordo" (nome fixo, vem do contrato, sem digitar; rótulo antes de ":" sai — `signerDisplayName`) (MP 2.200-2/2001, art. 10 § 2º).
Banco guarda só HMAC do token e do código (10 min, 5 tentativas, 1 min entre envios); evidências por parte
(IP, dispositivo, data/hora) e histórico de eventos. Todos assinaram → PDF final com página de evidências no
bucket privado (`contratos/AAAA-MM/…`), baixável no app e no próprio link. Envio exige empresa contratante
completa (sem "[CNPJ da empresa]" no texto). Assinado não se cancela (faz-se distrato). Novo link invalida o
anterior. Modelos-base são ponto de partida: **revisar com o jurídico** antes do primeiro uso.
**Vigência** (`starts_on`/`ends_on`, nulo = indeterminado): lida dos campos `{{inicio}}` + `{{fim}}` ou `{{prazo}}`
("12 meses", "indeterminado") e ajustável à mão; é controle interno (o texto assinado não muda). Abas: Ativos
(assinado e no prazo, inclui "a iniciar"/"vence em breve" ≤ 30 dias), Inativos (vencido ou **encerrado antes do
prazo** com data e motivo — reversível), Em andamento, Lixeira. **Excluir = lixeira** (motivo obrigatório,
links param, restaurável); aguardando assinatura precisa ser cancelado antes. Sem exclusão definitiva.
**Modelos**: dados da contratante sempre por variável (`{{empresa_razao_social}}`, `{{empresa_cnpj}}`, `{{empresa_endereco}}`,
`{{empresa_nome}}`) — o editor avisa e troca nome/CNPJ escritos à mão; `{{ }}` só aceita chave de campo (não valor).
Texto aceita `| tabela |` e `---` (tela e PDF).

**Cobrança e CRM — Tecnofit** (menu Cobrança e CRM; `crm.view`/`work`/`view_all`/`view_personal`/`dashboard`/`admin`;
papéis **CRM / Cobrança** e **Líder de CRM**). API externa da Tecnofit **só leitura** (`src/server/tecnofit/client.ts`;
login `POST /v1/auth/login` com as chaves no corpo → Bearer; ≤ 200 req/min, o cliente espaça; `TECNOFIT_FAKE=1` simula).
Chaves só na Vercel (`TECNOFIT_API_KEY`/`TECNOFIT_API_SECRET`). Sincronização **1×/dia** (cron 05h17, `/api/cron/tecnofit`,
retoma de onde parou): vendas não recebidas (12 meses) + bloqueados/restritos + quem já tem caso → por aluno, vendas
(`openValue`/`dueDate`) e celular. Débito = venda com valor em aberto vencida ou vencendo em ≤ 3 dias. Caso **COBRANCA**
(1 aberto por aluno e tipo, índice parcial); `blocked`/`restricted` sem venda em aberto = **PENDENCIA** ("Pendência na
recepção", fora dos números de inadimplência). Pagou na Tecnofit → caso RESOLVIDO na rodada seguinte (valores recalculados
dos débitos, sem duplicar). **Responsável = consultor da Tecnofit** (o da ligação de CRM mais recente — o cadastro do aluno na
API não traz consultor) vinculado **à mão** ao usuário em Configurações; sem vínculo = "Sem responsável", o **líder distribui**
e vê tudo. Responsável é fixo até o caso fechar. **O sistema NÃO fala com o aluno** (decisão de 11/11): cada passo da régua
(**D-3, D0, D+3, D+5, D+7, D+15**) vira **tarefa do consultor** (`crm_tasks`, `crm-task-service.ts`; tela Cobrança e CRM →
Tarefas de CRM), mais pendência na recepção e "Retorno / promessa". O consultor **registra o contato na Tecnofit** (Ligações do
CRM): ligação **concluída** depois que a tarefa entrou na lista dá baixa sozinha; ligação **pendente agendada** (retorno/promessa)
**pausa a régua** até a data e vira tarefa quando chega. Novo passo substitui o anterior não feito (anota "sem contato no D+3");
não feita continua no topo ("atrasada há N dias"); pagou → baixa "pagamento"; botão "Já registrei na Tecnofit" = baixa manual
(auditada). D+15 = escalado para o líder. **O líder (`crm.view_all`) filtra e complementa**: tela **Time de CRM**
(`crm_agent_settings`) define por consultor os **tipos** que entram na lista (vazio = todos; tarefa do líder sempre entra; o resto
fica com o líder em "Fora das regras") e o **horário (6h–14h) e dias** do WhatsApp (padrão 8h, seg–sáb); em Tarefas, **adia**
(`show_from`, até 60 dias) ou **tira da lista** (motivo; não é recriada) e cria **tarefa manual** (consultor, data — padrão amanhã —,
o que fazer, aluno opcional só entre os que estão na Cobrança; com aluno, a ligação na Tecnofit dá baixa). Tarefa guarda `owner_id`
(acompanha o caso na redistribuição). **WhatsApp no horário de cada consultor**: crons diários `/api/cron/crm-tarefas?hora=6…14`
(9 entradas, uma por hora — vale em qualquer plano da Vercel; chega a partir da hora, nunca antes), 1 envio por pessoa por dia
(`crm_digest_sends`), texto e liga/desliga na automação "Tarefas de CRM do dia" (público `CRM_TAREFAS`, nasce **desligada**; o
agendador das 8h não a roda): **só contagens, valor e link** — nunca nome/telefone de aluno. Pagar = app da Tecnofit, Pix ou
recepção; histórico de cobrança 5 anos. Painel do gestor e renovações = próximas fases; webhooks só quando a Tecnofit documentar.
