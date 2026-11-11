-- Tarefas de CRM: o líder filtra (regras por consultor + adiar/tirar da lista), cria tarefas manuais
-- (aluno opcional) e escolhe o horário do WhatsApp de cada consultor (envio de hora em hora, 1 por dia).
ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "created_by" UUID;
ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "customer_id" UUID;
ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "owner_id" UUID;
ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "removed_reason" TEXT;
ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "show_from" DATE;
ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "crm_tasks" ALTER COLUMN "case_id" DROP NOT NULL;
-- Tarefas que já existem: aparecem desde que foram criadas; responsável e aluno vêm do caso.
UPDATE "crm_tasks" t SET "show_from" = t."created_on" WHERE t."show_from" IS NULL;
UPDATE "crm_tasks" t SET "owner_id" = c."owner_id", "customer_id" = c."customer_id"
  FROM "crm_cases" c WHERE c."id" = t."case_id" AND t."customer_id" IS NULL;
ALTER TABLE "crm_tasks" ALTER COLUMN "show_from" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "crm_tasks_status_owner_id_show_from_idx" ON "crm_tasks"("status", "owner_id", "show_from");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_tasks_customer_id_fkey') THEN
    ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "tec_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "crm_agent_settings" (
    "user_id" UUID NOT NULL,
    "task_kinds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "send_hour" INTEGER NOT NULL DEFAULT 8,
    "send_days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_agent_settings_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "crm_agent_settings_hour" CHECK ("send_hour" BETWEEN 6 AND 14)
);

CREATE TABLE IF NOT EXISTS "crm_digest_sends" (
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_digest_sends_pkey" PRIMARY KEY ("user_id", "day")
);

-- O envio agora é no horário de cada consultor.
UPDATE "wa_automations" SET "name" = 'Tarefas de CRM do dia (no horário de cada consultor)', "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'a0000000-0000-4000-8000-0000000000c1' AND "name" = 'Tarefas de CRM do dia (consultores)';
