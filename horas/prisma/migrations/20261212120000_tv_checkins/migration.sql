-- Check-ins na TV: turmas da Tecnofit ligadas à grade, check-ins do dia (só rótulo "Nome I." vai para a TV),
-- quem não quer aparecer e o controle da consulta (uma por minuto para todas as TVs). Telas atuais: desligado.
ALTER TABLE "tv_screens" ADD COLUMN IF NOT EXISTS "show_checkins" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tv_screens" ADD COLUMN IF NOT EXISTS "space_id" UUID;

CREATE TABLE IF NOT EXISTS "tec_class_links" (
    "id" UUID NOT NULL,
    "tecnofit_class_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modality_id" UUID,
    "space_id" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tec_class_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tec_class_links_tecnofit_class_id_key" ON "tec_class_links"("tecnofit_class_id");

CREATE TABLE IF NOT EXISTS "tec_class_slots" (
    "day" DATE NOT NULL,
    "tecnofit_event_id" TEXT NOT NULL,
    "tecnofit_class_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "capacity" INTEGER,
    "occupied" INTEGER,
    CONSTRAINT "tec_class_slots_pkey" PRIMARY KEY ("day", "tecnofit_event_id")
);

CREATE TABLE IF NOT EXISTS "tv_checkins" (
    "day" DATE NOT NULL,
    "tecnofit_class_id" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "customer_tec_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "class_name" TEXT NOT NULL,
    "checkin_at" TEXT,
    CONSTRAINT "tv_checkins_pkey" PRIMARY KEY ("day", "tecnofit_class_id", "start", "customer_tec_id")
);

CREATE TABLE IF NOT EXISTS "tv_checkin_sync" (
    "day" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "full_at" TIMESTAMP(3),
    CONSTRAINT "tv_checkin_sync_pkey" PRIMARY KEY ("day", "kind")
);

CREATE TABLE IF NOT EXISTS "tv_hidden_customers" (
    "customer_tec_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tv_hidden_customers_pkey" PRIMARY KEY ("customer_tec_id")
);

-- Permissão nova: marcar quem não quer aparecer na TV (recepção/coordenação/CRM).
INSERT INTO "permissions" ("id", "key", "description")
VALUES (gen_random_uuid(), 'tv.privacy', 'Check-ins na TV: ver os check-ins do dia e marcar quem não quer aparecer')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."key" IN ('ADMIN', 'COORDENADOR', 'LIDER', 'CRM', 'CRM_LIDER') AND p."key" = 'tv.privacy'
ON CONFLICT DO NOTHING;
