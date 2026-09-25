-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('FERIAS', 'ATESTADO', 'AFASTAMENTO', 'FOLGA');

-- CreateEnum
CREATE TYPE "LeaveCoverage" AS ENUM ('PENDENTE', 'CANCELAR', 'SUBSTITUIR');

-- CreateEnum
CREATE TYPE "ManualEntryType" AS ENUM ('COORDENACAO', 'REUNIAO', 'CURSO', 'EVENTO', 'COMPENSACAO', 'AJUSTE', 'OUTRO');

-- AlterTable
ALTER TABLE "class_exceptions" ADD COLUMN     "leave_id" UUID;

-- CreateTable
CREATE TABLE "leaves" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "type" "LeaveType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "coverage" "LeaveCoverage" NOT NULL DEFAULT 'PENDENTE',
    "substitute_id" UUID,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_entries" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "modality_id" UUID,
    "type" "ManualEntryType" NOT NULL,
    "minutes" INTEGER NOT NULL,
    "date" DATE,
    "notes" TEXT NOT NULL,
    "voided_at" TIMESTAMP(3),
    "voided_by" UUID,
    "void_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leaves_teacher_id_start_date_end_date_idx" ON "leaves"("teacher_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "manual_entries_period_id_teacher_id_idx" ON "manual_entries"("period_id", "teacher_id");

-- CreateIndex
CREATE INDEX "class_exceptions_leave_id_idx" ON "class_exceptions"("leave_id");

-- AddForeignKey
ALTER TABLE "class_exceptions" ADD CONSTRAINT "class_exceptions_leave_id_fkey" FOREIGN KEY ("leave_id") REFERENCES "leaves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_substitute_id_fkey" FOREIGN KEY ("substitute_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_modality_id_fkey" FOREIGN KEY ("modality_id") REFERENCES "modalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leaves"
  ADD CONSTRAINT "leave_range" CHECK ("end_date" >= "start_date"),
  ADD CONSTRAINT "leave_substitute" CHECK (("coverage" = 'SUBSTITUIR') = ("substitute_id" IS NOT NULL) AND "substitute_id" IS DISTINCT FROM "teacher_id");

ALTER TABLE "manual_entries"
  ADD CONSTRAINT "manual_entry_minutes" CHECK ("minutes" <> 0 AND "minutes" BETWEEN -60000 AND 60000),
  ADD CONSTRAINT "manual_entry_void" CHECK (("voided_at" IS NULL) = ("void_reason" IS NULL));
