-- CreateEnum
CREATE TYPE "MktCampaignType" AS ENUM ('AQUISICAO', 'RENOVACAO', 'RETENCAO', 'EVENTO', 'INSTITUCIONAL', 'ENDOMARKETING', 'AWARENESS', 'PARCERIA', 'VENDAS', 'LANCAMENTO');

-- CreateEnum
CREATE TYPE "MktCampaignStatus" AS ENUM ('IDEIA', 'PLANEJAMENTO', 'PRODUCAO', 'AGUARDANDO_APROVACAO', 'PROGRAMADA', 'ATIVA', 'FINALIZADA', 'ANALISE');

-- CreateEnum
CREATE TYPE "MktTaskColumn" AS ENUM ('BACKLOG', 'PROXIMAS', 'SEMANA', 'PRODUCAO', 'APROVACAO', 'PROGRAMADO', 'EXECUTADO', 'RESULTADOS');

-- CreateEnum
CREATE TYPE "MktPriority" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "MktTaskOrigin" AS ENUM ('MANUAL', 'IA', 'REUNIAO', 'ANTECEDENCIA');

-- CreateEnum
CREATE TYPE "MktEventStatus" AS ENUM ('PLANEJADO', 'CONFIRMADO', 'REALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "MktCalendarKind" AS ENUM ('DATA_COMEMORATIVA', 'ACAO_COMERCIAL', 'PARCERIA', 'ATIVACAO', 'LANCAMENTO', 'SAUDE', 'ENDOMARKETING', 'AVISO', 'OUTRO');

-- CreateEnum
CREATE TYPE "MktSuggestionStatus" AS ENUM ('PENDENTE', 'ACEITA', 'PARCIAL', 'RECUSADA');

-- CreateTable
CREATE TABLE "mkt_areas" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "question" TEXT,
    "default_user_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mkt_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_events" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "location" TEXT,
    "audience" TEXT,
    "registration_url" TEXT,
    "modality_id" UUID,
    "status" "MktEventStatus" NOT NULL DEFAULT 'PLANEJADO',
    "owner_id" UUID,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_campaigns" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MktCampaignType" NOT NULL,
    "status" "MktCampaignStatus" NOT NULL DEFAULT 'IDEIA',
    "objective" TEXT,
    "audience" TEXT,
    "product" TEXT,
    "offer" TEXT,
    "message" TEXT,
    "cta" TEXT,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conversion_channel" TEXT,
    "conversion_url" TEXT,
    "lead_owner_id" UUID,
    "measurement" TEXT,
    "goal" TEXT,
    "kpis" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "budget_cents" INTEGER,
    "owner_id" UUID,
    "participant_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "modality_id" UUID,
    "event_id" UUID,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_tasks" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "campaign_id" UUID,
    "event_id" UUID,
    "area_id" UUID,
    "assignee_id" UUID,
    "collaborator_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "due_date" DATE,
    "priority" "MktPriority" NOT NULL DEFAULT 'MEDIA',
    "column" "MktTaskColumn" NOT NULL DEFAULT 'BACKLOG',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "origin" "MktTaskOrigin" NOT NULL DEFAULT 'MANUAL',
    "milestone" TEXT,
    "done_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_task_check_items" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mkt_task_check_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_task_links" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "mkt_task_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_task_dependencies" (
    "task_id" UUID NOT NULL,
    "depends_on_id" UUID NOT NULL,

    CONSTRAINT "mkt_task_dependencies_pkey" PRIMARY KEY ("task_id","depends_on_id")
);

-- CreateTable
CREATE TABLE "mkt_comments" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "author_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mkt_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_calendar_items" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "MktCalendarKind" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "description" TEXT,
    "modality_id" UUID,
    "owner_id" UUID,
    "audience" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_calendar_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_ai_suggestions" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "campaign_id" UUID,
    "meeting_id" UUID,
    "payload" JSONB NOT NULL,
    "status" "MktSuggestionStatus" NOT NULL DEFAULT 'PENDENTE',
    "prompt_version" TEXT NOT NULL,
    "model" TEXT,
    "created_by" UUID,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mkt_ai_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_meetings" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "agenda" JSONB NOT NULL,
    "notes" TEXT,
    "minutes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mkt_areas_key_key" ON "mkt_areas"("key");

-- CreateIndex
CREATE INDEX "mkt_events_start_date_idx" ON "mkt_events"("start_date");

-- CreateIndex
CREATE INDEX "mkt_campaigns_start_date_idx" ON "mkt_campaigns"("start_date");

-- CreateIndex
CREATE INDEX "mkt_campaigns_status_idx" ON "mkt_campaigns"("status");

-- CreateIndex
CREATE INDEX "mkt_tasks_column_position_idx" ON "mkt_tasks"("column", "position");

-- CreateIndex
CREATE INDEX "mkt_tasks_campaign_id_idx" ON "mkt_tasks"("campaign_id");

-- CreateIndex
CREATE INDEX "mkt_tasks_due_date_idx" ON "mkt_tasks"("due_date");

-- CreateIndex
CREATE INDEX "mkt_task_check_items_task_id_idx" ON "mkt_task_check_items"("task_id");

-- CreateIndex
CREATE INDEX "mkt_task_links_task_id_idx" ON "mkt_task_links"("task_id");

-- CreateIndex
CREATE INDEX "mkt_comments_entity_type_entity_id_idx" ON "mkt_comments"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "mkt_calendar_items_start_date_idx" ON "mkt_calendar_items"("start_date");

-- CreateIndex
CREATE INDEX "mkt_ai_suggestions_kind_status_idx" ON "mkt_ai_suggestions"("kind", "status");

-- CreateIndex
CREATE INDEX "mkt_meetings_date_idx" ON "mkt_meetings"("date");

-- AddForeignKey
ALTER TABLE "mkt_campaigns" ADD CONSTRAINT "mkt_campaigns_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "mkt_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mkt_tasks" ADD CONSTRAINT "mkt_tasks_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "mkt_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mkt_tasks" ADD CONSTRAINT "mkt_tasks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "mkt_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mkt_tasks" ADD CONSTRAINT "mkt_tasks_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "mkt_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mkt_task_check_items" ADD CONSTRAINT "mkt_task_check_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "mkt_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mkt_task_links" ADD CONSTRAINT "mkt_task_links_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "mkt_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mkt_task_dependencies" ADD CONSTRAINT "mkt_task_dependencies_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "mkt_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mkt_task_dependencies" ADD CONSTRAINT "mkt_task_dependencies_depends_on_id_fkey" FOREIGN KEY ("depends_on_id") REFERENCES "mkt_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mkt_ai_suggestions" ADD CONSTRAINT "mkt_ai_suggestions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "mkt_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mkt_ai_suggestions" ADD CONSTRAINT "mkt_ai_suggestions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "mkt_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Áreas do marketing (responsável padrão é escolhido em Marketing → Configurações)
INSERT INTO "mkt_areas" ("id", "key", "name", "color", "question", "sort_order") VALUES
  (gen_random_uuid(), 'PLANEJAMENTO', 'Planejamento & Campanhas', '#0169E9', 'O que vamos comunicar, para quem, quando e com qual objetivo?', 1),
  (gen_random_uuid(), 'COMUNICACAO', 'Comunicação Interna & Ativações', '#20C4FA', 'Todo mundo que precisava saber disso ficou sabendo?', 2),
  (gen_random_uuid(), 'CONTEUDO', 'Conteúdo & Social Media', '#3A86FF', 'Como transformamos isso em conteúdo que as pessoas querem assistir?', 3),
  (gen_random_uuid(), 'DESIGN', 'Design de Marca & Campanhas', '#022B57', 'Como transformar essa mensagem numa comunicação visual forte e coerente com a marca?', 4),
  (gen_random_uuid(), 'COMERCIAL', 'Comercial', '#16a34a', 'O que precisamos vender e o que está impedindo a venda?', 5);
