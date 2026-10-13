-- Automações editáveis no sistema (substituem os 3 envios fixos).
CREATE TABLE "wa_automations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "frequency" TEXT NOT NULL,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "month_day" INTEGER,
    "audience" TEXT NOT NULL,
    "filter" JSONB,
    "template" TEXT NOT NULL,
    "ask_confirmation" BOOLEAN NOT NULL DEFAULT false,
    "last_period" TEXT,
    "last_run_at" TIMESTAMP(3),
    "last_result" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_automations_pkey" PRIMARY KEY ("id")
);

-- As 3 que já existiam, com o liga/desliga atual.
INSERT INTO "wa_automations" ("id", "name", "active", "frequency", "weekdays", "month_day", "audience", "template", "ask_confirmation", "updated_at") VALUES
  ('a0000000-0000-4000-8000-000000000001', 'Lembrete semanal aos líderes', COALESCE((SELECT "enabled" FROM "wa_jobs" WHERE "key" = 'LIDERES'), true), 'SEMANAL', ARRAY[1], NULL, 'LIDERES_PENDENCIAS', $tpl$*Bom dia, {primeiro_nome}! Suas demandas da semana* 📋

{demandas}

Atualize o andamento em: {link}

_Muitos esportes, muitas paixões, uma Nação!_ 💙$tpl$, false, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000002', 'Escala do fim de semana', COALESCE((SELECT "enabled" FROM "wa_jobs" WHERE "key" = 'ESCALA_FDS'), true), 'SEMANAL', ARRAY[5], NULL, 'ESCALADOS_FDS', $tpl$*Oi, {primeiro_nome}! Sua escala deste fim de semana* 🔵

{escala}

Qualquer imprevisto, avise a coordenação o quanto antes.

_Muitos esportes, muitas paixões, uma Nação!_ 💙$tpl$, false, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000003', 'Grade mensal para confirmação', COALESCE((SELECT "enabled" FROM "wa_jobs" WHERE "key" = 'GRADE_MENSAL'), true), 'MENSAL', ARRAY[]::INTEGER[], 1, 'PROFESSORES_GRADE', $tpl$*📅 Grade de {mes}*

{grade}

*Por favor, confira e responda esta mensagem:*
✅ *OK* — está tudo certo
✏️ ou descreva o que precisa ajustar (horário, aula, férias…).$tpl$, true, CURRENT_TIMESTAMP);

-- "wa_jobs" fica (sem uso) para a versão anterior seguir funcionando até o deploy; sai numa limpeza futura.

-- Confirmações genéricas (qualquer automação, professor, usuário ou número).
-- Tabela nova: "wa_confirmations" (formato antigo, sem uso) fica para uma limpeza futura.
CREATE TABLE "wa_confirmation_requests" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "recipient_key" TEXT NOT NULL,
    "teacher_id" UUID,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "phone_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "reply" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replied_at" TIMESTAMP(3),

    CONSTRAINT "wa_confirmation_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wa_confirmation_requests_kind_period_recipient_key_key" ON "wa_confirmation_requests"("kind", "period", "recipient_key");
CREATE INDEX "wa_confirmation_requests_phone_key_status_idx" ON "wa_confirmation_requests"("phone_key", "status");
