-- AlterTable
ALTER TABLE "proc_demands" ADD COLUMN     "blocker" TEXT,
ADD COLUMN     "focus_week" TEXT,
ADD COLUMN     "meeting_id" UUID;

-- CreateTable
CREATE TABLE "proc_meetings" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "week" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "summary" JSONB,
    "created_by" UUID,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proc_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proc_meetings_date_idx" ON "proc_meetings"("date");

-- CreateIndex
CREATE INDEX "proc_demands_focus_week_idx" ON "proc_demands"("focus_week");

