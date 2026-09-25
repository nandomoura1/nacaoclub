-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('TITULAR', 'AUXILIAR', 'ESTAGIARIO');

-- CreateTable
CREATE TABLE "schedule_slots" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "schedule_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_slot_versions" (
    "id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_min" INTEGER NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "modality_id" UUID NOT NULL,
    "activity_type_id" UUID NOT NULL,
    "space_id" UUID,
    "label" TEXT,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "change_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "schedule_slot_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_version_teachers" (
    "version_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "role" "AssignmentRole" NOT NULL DEFAULT 'TITULAR',

    CONSTRAINT "slot_version_teachers_pkey" PRIMARY KEY ("version_id","teacher_id")
);

-- CreateIndex
CREATE INDEX "schedule_slot_versions_slot_id_valid_from_idx" ON "schedule_slot_versions"("slot_id", "valid_from");

-- CreateIndex
CREATE INDEX "schedule_slot_versions_weekday_valid_from_valid_to_idx" ON "schedule_slot_versions"("weekday", "valid_from", "valid_to");

-- CreateIndex
CREATE INDEX "schedule_slot_versions_modality_id_idx" ON "schedule_slot_versions"("modality_id");

-- CreateIndex
CREATE INDEX "slot_version_teachers_teacher_id_idx" ON "slot_version_teachers"("teacher_id");

-- AddForeignKey
ALTER TABLE "schedule_slot_versions" ADD CONSTRAINT "schedule_slot_versions_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "schedule_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slot_versions" ADD CONSTRAINT "schedule_slot_versions_modality_id_fkey" FOREIGN KEY ("modality_id") REFERENCES "modalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slot_versions" ADD CONSTRAINT "schedule_slot_versions_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "activity_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slot_versions" ADD CONSTRAINT "schedule_slot_versions_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_version_teachers" ADD CONSTRAINT "slot_version_teachers_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "schedule_slot_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_version_teachers" ADD CONSTRAINT "slot_version_teachers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- Regras de integridade que o Prisma não expressa
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "schedule_slot_versions"
  ADD CONSTRAINT "slot_version_weekday" CHECK ("weekday" BETWEEN 1 AND 7),
  ADD CONSTRAINT "slot_version_start" CHECK ("start_min" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "slot_version_duration" CHECK ("duration_min" BETWEEN 5 AND 600),
  ADD CONSTRAINT "slot_version_validity" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
  -- Uma aula nunca tem duas versões valendo no mesmo dia.
  ADD CONSTRAINT "slot_version_no_overlap" EXCLUDE USING gist (
    "slot_id" WITH =,
    daterange("valid_from", "valid_to", '[]') WITH &&
  );
