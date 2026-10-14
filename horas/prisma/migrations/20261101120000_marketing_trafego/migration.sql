-- CreateTable
CREATE TABLE "mkt_ad_spends" (
    "id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "campaign_id" UUID,
    "ad_name" TEXT,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "spend_cents" INTEGER NOT NULL,
    "impressions" INTEGER,
    "clicks" INTEGER,
    "platform_leads" INTEGER,
    "notes" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'MANUAL',
    "external_ref" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_ad_spends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mkt_ad_spends_external_ref_key" ON "mkt_ad_spends"("external_ref");

-- CreateIndex
CREATE INDEX "mkt_ad_spends_period_start_period_end_idx" ON "mkt_ad_spends"("period_start", "period_end");

-- CreateIndex
CREATE INDEX "mkt_ad_spends_campaign_id_idx" ON "mkt_ad_spends"("campaign_id");

