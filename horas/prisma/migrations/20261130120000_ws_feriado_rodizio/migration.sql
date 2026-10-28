-- AlterTable
ALTER TABLE "ws_day_overrides" ADD COLUMN     "confirmed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ws_sectors" ADD COLUMN     "holiday_rotate" BOOLEAN NOT NULL DEFAULT false;
