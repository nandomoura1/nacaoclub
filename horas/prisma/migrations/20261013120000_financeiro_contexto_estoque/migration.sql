-- AlterEnum
ALTER TYPE "FinDataset" ADD VALUE 'ESTOQUE';

-- AlterTable
ALTER TABLE "fin_periods" ADD COLUMN     "context_at" TIMESTAMP(3),
ADD COLUMN     "partner_context" TEXT,
ADD COLUMN     "report_exclusions" JSONB;

