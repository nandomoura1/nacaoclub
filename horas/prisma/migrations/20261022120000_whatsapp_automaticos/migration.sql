-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "wa_jobs" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_period" TEXT,
    "last_run_at" TIMESTAMP(3),
    "last_result" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_jobs_pkey" PRIMARY KEY ("key")
);

