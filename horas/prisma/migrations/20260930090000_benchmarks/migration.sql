-- CreateEnum
CREATE TYPE "BenchmarkCategory" AS ENUM ('GIRL', 'HERO', 'CLASSICO', 'NACAO');

-- CreateTable
CREATE TABLE "workout_benchmarks" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "BenchmarkCategory" NOT NULL,
    "format" TEXT,
    "time_cap_min" INTEGER,
    "content" TEXT NOT NULL,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'NACAO',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_benchmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workout_benchmarks_name_key" ON "workout_benchmarks"("name");
