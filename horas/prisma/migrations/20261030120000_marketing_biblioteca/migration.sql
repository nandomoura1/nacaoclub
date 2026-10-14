-- CreateTable
CREATE TABLE "mkt_assets" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ARTE',
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "campaign_id" UUID,
    "event_id" UUID,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "review_note" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mkt_assets_path_key" ON "mkt_assets"("path");

-- CreateIndex
CREATE INDEX "mkt_assets_status_created_at_idx" ON "mkt_assets"("status", "created_at");

-- CreateIndex
CREATE INDEX "mkt_assets_campaign_id_idx" ON "mkt_assets"("campaign_id");

