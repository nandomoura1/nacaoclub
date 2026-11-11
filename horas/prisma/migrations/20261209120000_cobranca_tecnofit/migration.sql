-- Cobrança e CRM (F1): espelho mínimo da Tecnofit, casos de cobrança/pendência,
-- consultores ↔ usuários e registro das sincronizações. Só leitura da Tecnofit.
CREATE TABLE IF NOT EXISTS "tec_customers" (
    "id" UUID NOT NULL,
    "tecnofit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "mobile" TEXT,
    "consultant_tec_id" TEXT,
    "contacts_checked_on" DATE,
    "last_seen_on" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tec_customers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tec_customers_tecnofit_id_key" ON "tec_customers"("tecnofit_id");
CREATE INDEX IF NOT EXISTS "tec_customers_last_seen_on_idx" ON "tec_customers"("last_seen_on");

CREATE TABLE IF NOT EXISTS "tec_debts" (
    "id" UUID NOT NULL,
    "tecnofit_sale_id" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "due_date" DATE,
    "open_value" DECIMAL(12,2) NOT NULL,
    "first_open_value" DECIMAL(12,2) NOT NULL,
    "total_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "first_seen_on" DATE NOT NULL,
    "last_seen_on" DATE NOT NULL,
    "paid_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tec_debts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tec_debts_tecnofit_sale_id_key" ON "tec_debts"("tecnofit_sale_id");
CREATE INDEX IF NOT EXISTS "tec_debts_customer_id_status_idx" ON "tec_debts"("customer_id", "status");

CREATE TABLE IF NOT EXISTS "crm_consultants" (
    "id" UUID NOT NULL,
    "tecnofit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "user_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_consultants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_consultants_tecnofit_id_key" ON "crm_consultants"("tecnofit_id");

CREATE TABLE IF NOT EXISTS "crm_cases" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "owner_id" UUID,
    "opened_on" DATE NOT NULL,
    "closed_on" DATE,
    "close_reason" TEXT,
    "original_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "open_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "recovered_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "oldest_due" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_cases_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "crm_cases_status_owner_id_idx" ON "crm_cases"("status", "owner_id");
CREATE INDEX IF NOT EXISTS "crm_cases_customer_id_kind_status_idx" ON "crm_cases"("customer_id", "kind", "status");
-- No máximo um caso ABERTO por aluno e tipo.
CREATE UNIQUE INDEX IF NOT EXISTS "crm_cases_one_open" ON "crm_cases"("customer_id", "kind") WHERE "status" = 'ABERTO';

CREATE TABLE IF NOT EXISTS "tec_sync_runs" (
    "id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RODANDO',
    "mode" TEXT NOT NULL,
    "pending" JSONB NOT NULL DEFAULT '[]',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "api_calls" INTEGER NOT NULL DEFAULT 0,
    "invocations" INTEGER NOT NULL DEFAULT 0,
    "triggered_by" UUID,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    CONSTRAINT "tec_sync_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "tec_sync_runs_day_idx" ON "tec_sync_runs"("day");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tec_debts_customer_id_fkey') THEN
    ALTER TABLE "tec_debts" ADD CONSTRAINT "tec_debts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "tec_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_cases_customer_id_fkey') THEN
    ALTER TABLE "crm_cases" ADD CONSTRAINT "crm_cases_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "tec_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Permissões novas (Cobrança e CRM) e os papéis "CRM / Cobrança" e "Líder de CRM".
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'crm.view', 'Cobrança e CRM: ver a própria fila de cobrança e os casos'),
  (gen_random_uuid(), 'crm.work', 'Cobrança e CRM: trabalhar os casos (registrar contato e promessa, enviar WhatsApp de cobrança)'),
  (gen_random_uuid(), 'crm.view_all', 'Cobrança e CRM: ver a fila de todos, os casos sem responsável e redistribuir (líder)'),
  (gen_random_uuid(), 'crm.view_personal', 'Cobrança e CRM: ver o celular completo do aluno'),
  (gen_random_uuid(), 'crm.dashboard', 'Cobrança e CRM: painel do gestor (inadimplência, recuperado, produtividade)'),
  (gen_random_uuid(), 'crm.admin', 'Cobrança e CRM: consultores ↔ usuários, régua, modelos e sincronização com a Tecnofit')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "roles" ("id", "key", "name", "description", "is_system", "created_at", "updated_at") VALUES
  (gen_random_uuid(), 'CRM', 'CRM / Cobrança', 'Consultor do time de CRM: trabalha a própria fila de cobrança (alunos da Tecnofit) e vê o celular do aluno.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CRM_LIDER', 'Líder de CRM', 'Líder do time de CRM: vê a fila de todos, distribui os casos sem responsável e acompanha o painel.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE (r."key" = 'ADMIN' AND p."key" LIKE 'crm.%')
   OR (r."key" = 'CRM' AND p."key" IN ('crm.view', 'crm.work', 'crm.view_personal'))
   OR (r."key" = 'CRM_LIDER' AND p."key" IN ('crm.view', 'crm.work', 'crm.view_all', 'crm.view_personal', 'crm.dashboard'))
ON CONFLICT DO NOTHING;
