-- Cobrança vira lista de tarefas do consultor (o sistema não fala com o aluno).
-- Baixa pela ligação concluída registrada na Tecnofit; retorno agendado lá pausa a régua.
ALTER TABLE "tec_customers" ADD COLUMN IF NOT EXISTS "last_call_done_on" DATE;
ALTER TABLE "tec_customers" ADD COLUMN IF NOT EXISTS "next_call_on" DATE;

CREATE TABLE IF NOT EXISTS "crm_tasks" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "ref_date" DATE NOT NULL,
    "created_on" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "done_on" DATE,
    "done_via" TEXT,
    "done_by" UUID,
    "missed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "crm_tasks_status_created_on_idx" ON "crm_tasks"("status", "created_on");
CREATE UNIQUE INDEX IF NOT EXISTS "crm_tasks_case_id_kind_ref_date_key" ON "crm_tasks"("case_id", "kind", "ref_date");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_tasks_case_id_fkey') THEN
    ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "crm_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Envio diário da lista (07h30) como automação de WhatsApp — nasce DESLIGADA; o admin liga em Administração → Automações.
INSERT INTO "wa_automations" ("id", "name", "active", "frequency", "weekdays", "month_day", "audience", "template", "ask_confirmation", "updated_at")
SELECT 'a0000000-0000-4000-8000-0000000000c1', 'Tarefas de CRM do dia (consultores)', false, 'DIARIA', ARRAY[]::INTEGER[], NULL, 'CRM_TAREFAS', $tpl$*Bom dia, {primeiro_nome}! Suas tarefas de CRM de hoje* 📋

{tarefas_crm}

Abra a lista: {link}
Registre cada contato na Tecnofit (Ligações do CRM): a tarefa sai da lista sozinha. Combinou retorno ou promessa? Agende a ligação lá com a data.

_Muitos esportes, muitas paixões, uma Nação!_ 💙$tpl$, false, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "wa_automations" WHERE "audience" = 'CRM_TAREFAS');
