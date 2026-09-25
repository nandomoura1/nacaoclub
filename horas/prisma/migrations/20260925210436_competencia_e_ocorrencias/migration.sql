-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('ABERTO', 'EM_REVISAO_COORDENACAO', 'APROVADO_COORDENACAO', 'REVISAO_ADMINISTRATIVA', 'FECHADO');

-- CreateEnum
CREATE TYPE "OccurrenceOrigin" AS ENUM ('GRADE', 'EXTRA');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('PREVISTA', 'REALIZADA', 'CANCELADA', 'AGUARDANDO_DECISAO_FERIADO');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PREVISTA', 'REALIZADA', 'SUBSTITUIDA', 'CANCELADA', 'AUSENTE_PENDENTE');

-- CreateEnum
CREATE TYPE "AbsenceReason" AS ENUM ('FALTA', 'FERIAS', 'ATESTADO', 'FOLGA', 'OUTRO');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('FALTA', 'FERIAS', 'ATESTADO', 'FOLGA', 'SUBSTITUICAO', 'AULA_CANCELADA', 'AULA_EXTRA', 'ALTERACAO_HORARIO', 'CONFIRMACAO', 'COMPENSACAO', 'DECISAO_FERIADO', 'REVERSAO', 'OUTRO');

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'ABERTO',
    "generated_at" TIMESTAMP(3),
    "generated_by" UUID,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMP(3),
    "closed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_occurrences" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "origin" "OccurrenceOrigin" NOT NULL DEFAULT 'GRADE',
    "slot_id" UUID,
    "slot_version_id" UUID,
    "modality_id" UUID NOT NULL,
    "activity_type_id" UUID NOT NULL,
    "space_id" UUID,
    "label" TEXT,
    "start_min" INTEGER NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "planned_start_min" INTEGER NOT NULL,
    "planned_duration_min" INTEGER NOT NULL,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'PREVISTA',
    "holiday_id" UUID,
    "cancellation_reason_id" UUID,
    "touched" BOOLEAN NOT NULL DEFAULT false,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_assignments" (
    "id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "role" "AssignmentRole" NOT NULL DEFAULT 'TITULAR',
    "planned_teacher_id" UUID,
    "executing_teacher_id" UUID,
    "minutes" INTEGER NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PREVISTA',
    "absence_reason" "AbsenceReason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_exceptions" (
    "id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "assignment_id" UUID,
    "type" "ExceptionType" NOT NULL,
    "cancellation_reason_id" UUID,
    "notes" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reverts_exception_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_year_month_key" ON "payroll_periods"("year", "month");

-- CreateIndex
CREATE INDEX "class_occurrences_period_id_date_idx" ON "class_occurrences"("period_id", "date");

-- CreateIndex
CREATE INDEX "class_occurrences_date_start_min_idx" ON "class_occurrences"("date", "start_min");

-- CreateIndex
CREATE INDEX "class_occurrences_modality_id_date_idx" ON "class_occurrences"("modality_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "class_occurrences_slot_id_date_key" ON "class_occurrences"("slot_id", "date");

-- CreateIndex
CREATE INDEX "class_assignments_occurrence_id_idx" ON "class_assignments"("occurrence_id");

-- CreateIndex
CREATE INDEX "class_assignments_planned_teacher_id_idx" ON "class_assignments"("planned_teacher_id");

-- CreateIndex
CREATE INDEX "class_assignments_executing_teacher_id_idx" ON "class_assignments"("executing_teacher_id");

-- CreateIndex
CREATE INDEX "class_exceptions_occurrence_id_created_at_idx" ON "class_exceptions"("occurrence_id", "created_at");

-- AddForeignKey
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_slot_version_id_fkey" FOREIGN KEY ("slot_version_id") REFERENCES "schedule_slot_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_modality_id_fkey" FOREIGN KEY ("modality_id") REFERENCES "modalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "activity_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_holiday_id_fkey" FOREIGN KEY ("holiday_id") REFERENCES "holidays"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_cancellation_reason_id_fkey" FOREIGN KEY ("cancellation_reason_id") REFERENCES "cancellation_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "class_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_planned_teacher_id_fkey" FOREIGN KEY ("planned_teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_executing_teacher_id_fkey" FOREIGN KEY ("executing_teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_exceptions" ADD CONSTRAINT "class_exceptions_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "class_occurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- Integridade que o Prisma não expressa
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "payroll_periods"
  ADD CONSTRAINT "payroll_period_month" CHECK ("month" BETWEEN 1 AND 12),
  ADD CONSTRAINT "payroll_period_range" CHECK ("end_date" >= "start_date"),
  -- Uma data pertence a uma competência só.
  ADD CONSTRAINT "payroll_period_no_overlap" EXCLUDE USING gist (daterange("start_date", "end_date", '[]') WITH &&);

ALTER TABLE "class_occurrences"
  ADD CONSTRAINT "occurrence_start" CHECK ("start_min" BETWEEN 0 AND 1439 AND "planned_start_min" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "occurrence_duration" CHECK ("duration_min" BETWEEN 5 AND 600 AND "planned_duration_min" BETWEEN 5 AND 600),
  ADD CONSTRAINT "occurrence_origin" CHECK (("origin" = 'GRADE') = ("slot_id" IS NOT NULL));

ALTER TABLE "class_assignments"
  ADD CONSTRAINT "assignment_minutes" CHECK ("minutes" BETWEEN 0 AND 600),
  -- Aula dada precisa dizer quem deu.
  ADD CONSTRAINT "assignment_executor" CHECK ("status" NOT IN ('REALIZADA', 'SUBSTITUIDA') OR "executing_teacher_id" IS NOT NULL);

-- Exceções são o histórico da aula: somente-inclusão.
CREATE TRIGGER "class_exceptions_append_only"
  BEFORE UPDATE OR DELETE ON "class_exceptions"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();
CREATE TRIGGER "class_exceptions_no_truncate"
  BEFORE TRUNCATE ON "class_exceptions"
  FOR EACH STATEMENT EXECUTE FUNCTION "forbid_mutation"();
