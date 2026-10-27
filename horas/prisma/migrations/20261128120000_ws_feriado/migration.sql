-- AlterTable
ALTER TABLE "ws_sectors" ADD COLUMN     "holiday_confirm" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "holiday_mode" TEXT;
