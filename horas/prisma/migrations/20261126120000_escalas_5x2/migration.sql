-- CreateEnum
CREATE TYPE "WsBond" AS ENUM ('CLT', 'FUNAP', 'MEI', 'FREELANCER');

-- CreateEnum
CREATE TYPE "WsMode" AS ENUM ('FIXO', 'COBERTURA');

-- CreateEnum
CREATE TYPE "WsScheduleStatus" AS ENUM ('RASCUNHO', 'APROVADA', 'PUBLICADA');

-- AlterEnum
ALTER TYPE "LeaveType" ADD VALUE 'INDISPONIVEL';

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "nacao_hours" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "ws_sectors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "proc_sector_id" UUID,
    "hours" JSONB NOT NULL DEFAULT '{}',
    "cycle_ref" DATE NOT NULL,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ws_sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ws_posts" (
    "id" UUID NOT NULL,
    "sector_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT,
    "start_min" INTEGER NOT NULL,
    "end_min" INTEGER NOT NULL,
    "weekdays" INTEGER[],
    "min_people" INTEGER NOT NULL DEFAULT 1,
    "function_name" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ws_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ws_members" (
    "id" UUID NOT NULL,
    "sector_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "function_name" TEXT,
    "alt_functions" TEXT[],
    "bond" "WsBond" NOT NULL DEFAULT 'CLT',
    "mode" "WsMode" NOT NULL DEFAULT 'FIXO',
    "hours" JSONB NOT NULL DEFAULT '{}',
    "weekly_min" INTEGER NOT NULL DEFAULT 2400,
    "fixed_off" INTEGER[],
    "available_days" INTEGER[],
    "saturday" BOOLEAN NOT NULL DEFAULT true,
    "sunday" BOOLEAN NOT NULL DEFAULT true,
    "holiday" BOOLEAN NOT NULL DEFAULT true,
    "auto_schedule" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ws_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ws_rules" (
    "id" UUID NOT NULL,
    "sector_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ws_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ws_day_overrides" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "sector_id" UUID,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "hours" JSONB,
    "reason" TEXT NOT NULL,
    "event_id" UUID,
    "extra_people" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ws_day_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ws_legal_params" (
    "id" UUID NOT NULL,
    "bond" "WsBond" NOT NULL,
    "valid_from" DATE NOT NULL,
    "max_daily_min" INTEGER,
    "max_daily_extra_min" INTEGER,
    "max_weekly_min" INTEGER,
    "min_rest_between_min" INTEGER,
    "max_consecutive_days" INTEGER,
    "sunday_off_every_weeks" INTEGER,
    "break_long_over_min" INTEGER,
    "break_long_min" INTEGER,
    "break_short_over_min" INTEGER,
    "break_short_min" INTEGER,
    "notes" TEXT,
    "validated_at" TIMESTAMP(3),
    "validated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ws_legal_params_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ws_schedules" (
    "id" UUID NOT NULL,
    "sector_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "WsScheduleStatus" NOT NULL DEFAULT 'RASCUNHO',
    "analysis" JSONB NOT NULL DEFAULT '{}',
    "generated_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "published_at" TIMESTAMP(3),
    "published_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ws_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ws_cells" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "start_min" INTEGER,
    "end_min" INTEGER,
    "break_min" INTEGER,
    "note" TEXT,
    "manual" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ws_cells_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ws_sectors_name_key" ON "ws_sectors"("name");

-- CreateIndex
CREATE INDEX "ws_posts_sector_id_idx" ON "ws_posts"("sector_id");

-- CreateIndex
CREATE UNIQUE INDEX "ws_members_sector_id_teacher_id_key" ON "ws_members"("sector_id", "teacher_id");

-- CreateIndex
CREATE INDEX "ws_rules_sector_id_idx" ON "ws_rules"("sector_id");

-- CreateIndex
CREATE INDEX "ws_day_overrides_date_idx" ON "ws_day_overrides"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ws_legal_params_bond_valid_from_key" ON "ws_legal_params"("bond", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "ws_schedules_sector_id_year_month_key" ON "ws_schedules"("sector_id", "year", "month");

-- CreateIndex
CREATE INDEX "ws_cells_member_id_date_idx" ON "ws_cells"("member_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ws_cells_schedule_id_member_id_date_key" ON "ws_cells"("schedule_id", "member_id", "date");

-- AddForeignKey
ALTER TABLE "ws_sectors" ADD CONSTRAINT "ws_sectors_proc_sector_id_fkey" FOREIGN KEY ("proc_sector_id") REFERENCES "proc_sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ws_posts" ADD CONSTRAINT "ws_posts_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "ws_sectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ws_members" ADD CONSTRAINT "ws_members_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "ws_sectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ws_members" ADD CONSTRAINT "ws_members_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ws_rules" ADD CONSTRAINT "ws_rules_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "ws_sectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ws_day_overrides" ADD CONSTRAINT "ws_day_overrides_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "ws_sectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ws_day_overrides" ADD CONSTRAINT "ws_day_overrides_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "mkt_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ws_schedules" ADD CONSTRAINT "ws_schedules_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "ws_sectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ws_cells" ADD CONSTRAINT "ws_cells_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "ws_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ws_cells" ADD CONSTRAINT "ws_cells_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "ws_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

