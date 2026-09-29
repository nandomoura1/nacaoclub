-- CreateEnum
CREATE TYPE "WorkoutBlockKind" AS ENUM ('MOBILIDADE', 'AQUECIMENTO', 'SKILL', 'CORE', 'FORCA', 'ESPECIFICO', 'WOD', 'FUNDAMENTO', 'JOGO', 'OUTRO');

-- CreateTable
CREATE TABLE "workout_weeks" (
    "id" UUID NOT NULL,
    "modality_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "footer_title" TEXT,
    "footer_text" TEXT,
    "footer_chips" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_weeks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_days" (
    "id" UUID NOT NULL,
    "week_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT,

    CONSTRAINT "workout_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_blocks" (
    "id" UUID NOT NULL,
    "day_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "kind" "WorkoutBlockKind" NOT NULL,
    "title" TEXT,
    "duration_min" INTEGER,
    "format" TEXT,
    "time_cap_min" INTEGER,
    "content" TEXT,
    "notes" TEXT,

    CONSTRAINT "workout_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workout_weeks_modality_id_week_start_key" ON "workout_weeks"("modality_id", "week_start");

-- CreateIndex
CREATE UNIQUE INDEX "workout_days_week_id_date_key" ON "workout_days"("week_id", "date");

-- CreateIndex
CREATE INDEX "workout_blocks_day_id_sort_order_idx" ON "workout_blocks"("day_id", "sort_order");

-- AddForeignKey
ALTER TABLE "workout_weeks" ADD CONSTRAINT "workout_weeks_modality_id_fkey" FOREIGN KEY ("modality_id") REFERENCES "modalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_days" ADD CONSTRAINT "workout_days_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "workout_weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "workout_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras que o banco garante sozinho.
ALTER TABLE "workout_weeks" ADD CONSTRAINT "workout_week_monday" CHECK (EXTRACT(ISODOW FROM "week_start") = 1);
ALTER TABLE "workout_blocks"
  ADD CONSTRAINT "workout_block_duration" CHECK ("duration_min" IS NULL OR "duration_min" BETWEEN 1 AND 300),
  ADD CONSTRAINT "workout_block_cap" CHECK ("time_cap_min" IS NULL OR "time_cap_min" BETWEEN 1 AND 300);

-- Permissão nova: admin e coordenadores lançam treinos e geram a arte.
INSERT INTO "permissions" ("id", "key", "description")
VALUES (gen_random_uuid(), 'workout.edit', 'Lançar treinos da semana e gerar a arte de divulgação')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."key" IN ('ADMIN', 'COORDENADOR') AND p."key" = 'workout.edit'
ON CONFLICT DO NOTHING;
