-- Cronograma do mês (Marketing): plano de conteúdo por mês + posts planejados (decisão 24/11).
-- O post liga (opcional) a campanha, evento e tarefa do Kanban; apagar um deles só desfaz a ligação.
CREATE TABLE IF NOT EXISTS "mkt_content_plans" (
    "id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "objectives" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "owner_id" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mkt_content_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mkt_content_plans_month_key" ON "mkt_content_plans" ("month");

CREATE TABLE IF NOT EXISTS "mkt_content_posts" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'INSTAGRAM',
    "topic" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "cta" TEXT,
    "stories" TEXT,
    "pending" TEXT,
    "campaign_id" UUID,
    "event_id" UUID,
    "task_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'PLANEJADO',
    "views" INTEGER,
    "origin" TEXT NOT NULL DEFAULT 'MANUAL',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mkt_content_posts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mkt_content_posts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "mkt_content_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "mkt_content_posts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "mkt_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "mkt_content_posts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "mkt_events"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "mkt_content_posts_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "mkt_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "mkt_content_posts_plan_id_date_idx" ON "mkt_content_posts" ("plan_id", "date");
CREATE INDEX IF NOT EXISTS "mkt_content_posts_date_idx" ON "mkt_content_posts" ("date");
