
-- CreateTable
CREATE TABLE "mkt_leads" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "interest" TEXT,
    "modality_id" UUID,
    "source" TEXT NOT NULL DEFAULT 'OUTRO',
    "stage" TEXT NOT NULL DEFAULT 'NOVO',
    "owner_id" UUID,
    "campaign_id" UUID,
    "link_id" UUID,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "notes" TEXT,
    "lost_reason" TEXT,
    "raw" JSONB,
    "external_ref" TEXT,
    "next_action_at" DATE,
    "converted_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_links" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'OUTRO',
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_content" TEXT,
    "campaign_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "last_click_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_link_click_days" (
    "link_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mkt_link_click_days_pkey" PRIMARY KEY ("link_id","day")
);

-- CreateIndex
CREATE UNIQUE INDEX "mkt_leads_external_ref_key" ON "mkt_leads"("external_ref");

-- CreateIndex
CREATE INDEX "mkt_leads_stage_created_at_idx" ON "mkt_leads"("stage", "created_at");

-- CreateIndex
CREATE INDEX "mkt_leads_phone_idx" ON "mkt_leads"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "mkt_links_slug_key" ON "mkt_links"("slug");

