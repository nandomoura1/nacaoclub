-- Tecnofit: avisos em tempo real (webhooks) e renovações (contratos que terminam em até 30 dias).
CREATE TABLE IF NOT EXISTS "tec_webhook_events" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "resource_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEBIDO',
    "error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    CONSTRAINT "tec_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "tec_webhook_events_received_at_idx" ON "tec_webhook_events"("received_at");

CREATE TABLE IF NOT EXISTS "tec_contracts" (
    "id" UUID NOT NULL,
    "tecnofit_id" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "name" TEXT,
    "start_date" DATE,
    "due_date" DATE NOT NULL,
    "status" TEXT,
    "renewed" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_on" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tec_contracts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tec_contracts_tecnofit_id_key" ON "tec_contracts"("tecnofit_id");
CREATE INDEX IF NOT EXISTS "tec_contracts_due_date_idx" ON "tec_contracts"("due_date");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tec_contracts_customer_id_fkey') THEN
    ALTER TABLE "tec_contracts" ADD CONSTRAINT "tec_contracts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "tec_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "tec_contract_checks" (
    "customer_tec_id" TEXT NOT NULL,
    "seen_on" DATE NOT NULL,
    "checked_on" DATE,
    CONSTRAINT "tec_contract_checks_pkey" PRIMARY KEY ("customer_tec_id")
);
CREATE INDEX IF NOT EXISTS "tec_contract_checks_checked_on_idx" ON "tec_contract_checks"("checked_on");

-- Tarefa de renovação não tem caso: uma por aluno e data de fim do contrato.
CREATE UNIQUE INDEX IF NOT EXISTS "crm_tasks_renovacao_unica" ON "crm_tasks"("customer_id", "kind", "ref_date") WHERE "case_id" IS NULL AND "kind" = 'RENOVACAO';
