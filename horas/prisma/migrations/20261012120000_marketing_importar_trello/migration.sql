-- AlterEnum
ALTER TYPE "MktTaskOrigin" ADD VALUE 'IMPORTACAO';

-- AlterTable
ALTER TABLE "mkt_tasks" ADD COLUMN     "external_ref" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "mkt_tasks_external_ref_key" ON "mkt_tasks"("external_ref");

