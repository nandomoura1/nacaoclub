-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MktCalendarKind" ADD VALUE 'TEMA_DO_MES';
ALTER TYPE "MktCalendarKind" ADD VALUE 'CONTEUDO';

-- AlterTable
ALTER TABLE "mkt_calendar_items" ADD COLUMN     "import_id" UUID;

-- AlterTable
ALTER TABLE "mkt_campaigns" ADD COLUMN     "import_id" UUID;

-- AlterTable
ALTER TABLE "mkt_events" ADD COLUMN     "import_id" UUID;

-- CreateTable
CREATE TABLE "mkt_imports" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "counts" JSONB NOT NULL,
    "undone_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mkt_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_knowledge" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT,
    "content" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mkt_calendar_items_import_id_idx" ON "mkt_calendar_items"("import_id");

-- CreateIndex
CREATE INDEX "mkt_campaigns_import_id_idx" ON "mkt_campaigns"("import_id");

-- CreateIndex
CREATE INDEX "mkt_events_import_id_idx" ON "mkt_events"("import_id");

