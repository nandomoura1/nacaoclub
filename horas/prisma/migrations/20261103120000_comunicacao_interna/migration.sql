-- CreateTable
CREATE TABLE "mkt_notices" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'AVISO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'TODOS',
    "filter" JSONB,
    "campaign_id" UUID,
    "send_whatsapp" BOOLEAN NOT NULL DEFAULT true,
    "ask_confirmation" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "show_until" DATE,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "published_at" TIMESTAMP(3),
    "published_by" UUID,
    "send_result" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_notice_reads" (
    "notice_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mkt_notice_reads_pkey" PRIMARY KEY ("notice_id","user_id")
);

-- CreateIndex
CREATE INDEX "mkt_notices_status_published_at_idx" ON "mkt_notices"("status", "published_at");

-- AddForeignKey
ALTER TABLE "mkt_notice_reads" ADD CONSTRAINT "mkt_notice_reads_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "mkt_notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

