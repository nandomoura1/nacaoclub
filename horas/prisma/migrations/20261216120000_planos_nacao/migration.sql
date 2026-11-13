-- Planos Nação (Administração → Planos Nação): tabelas de preços dos planos por ano.
-- Uma tabela VIGENTE (travada) e rascunhos (só quem edita vê); cada plano tem opções de preço
-- (mensal, semestral, anual…) com valor no cartão/cheque e na recorrência (por mês).
CREATE TABLE IF NOT EXISTS "plan_tables" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "base_table_id" UUID,
    "note" TEXT,
    "published_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plan_tables_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "plan_tables_one_vigente" ON "plan_tables" ("status") WHERE "status" = 'VIGENTE';

CREATE TABLE IF NOT EXISTS "plan_items" (
    "id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "base_item_id" UUID,
    "group_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modalities" TEXT,
    "common_classes" TEXT,
    "specific_classes" TEXT,
    "checkin" TEXT,
    "status" TEXT NOT NULL DEFAULT 'MANTEM',
    "note" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plan_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_items_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "plan_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "plan_items_table_id_idx" ON "plan_items" ("table_id");

CREATE TABLE IF NOT EXISTS "plan_options" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "months" INTEGER,
    "card_monthly" DECIMAL(12,2),
    "recurring_monthly" DECIMAL(12,2),
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plan_options_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_options_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "plan_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "plan_options_item_id_idx" ON "plan_options" ("item_id");

INSERT INTO "permissions" ("id", "key", "description")
VALUES (gen_random_uuid(), 'plans.view', 'Planos Nação: consultar a tabela de planos e preços vigente'),
       (gen_random_uuid(), 'plans.edit', 'Planos Nação: criar e editar tabelas de preços (rascunhos) e publicar a nova tabela')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE (r."key" = 'ADMIN' AND p."key" IN ('plans.view', 'plans.edit')) OR (r."key" = 'CONSULTA' AND p."key" = 'plans.view')
ON CONFLICT DO NOTHING;
