-- CreateEnum
CREATE TYPE "CondoCenterKind" AS ENUM ('INTERNAL', 'PARTNER');

-- CreateEnum
CREATE TYPE "CondoBilling" AS ENUM ('FULL', 'PRORATA', 'NONE');

-- CreateEnum
CREATE TYPE "CondoPeriodStatus" AS ENUM ('DRAFT', 'CLOSED');

-- CreateEnum
CREATE TYPE "CondoExpenseKind" AS ENUM ('FIXED', 'VARIABLE');

-- CreateEnum
CREATE TYPE "CondoChargeStatus" AS ENUM ('PENDING', 'SENT', 'PAID');

-- CreateTable
CREATE TABLE "condo_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "payee_name" TEXT NOT NULL DEFAULT 'Nação Club Recreações Esportivas Ltda',
    "payee_document" TEXT NOT NULL DEFAULT '17.179.101/0001-74',
    "pix_key" TEXT,
    "pix_city" TEXT NOT NULL DEFAULT 'BRASILIA',
    "bank_info" TEXT,
    "instructions" TEXT,
    "due_day" INTEGER NOT NULL DEFAULT 20,
    "flag_factors" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condo_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condo_centers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT,
    "kind" "CondoCenterKind" NOT NULL,
    "is_snack_bar" BOOLEAN NOT NULL DEFAULT false,
    "charges_condo" BOOLEAN NOT NULL DEFAULT true,
    "area_m2" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "iptu_share_pct" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "legal_name" TEXT,
    "document" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "active_from" DATE NOT NULL,
    "active_to" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condo_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condo_meters" (
    "id" UUID NOT NULL,
    "center_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "install_reading" DECIMAL(12,1) NOT NULL DEFAULT 0,
    "active_from" DATE NOT NULL,
    "active_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "condo_meters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condo_meter_readings" (
    "id" UUID NOT NULL,
    "meter_id" UUID NOT NULL,
    "month" CHAR(7) NOT NULL,
    "reading" DECIMAL(12,1) NOT NULL,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "is_reset" BOOLEAN NOT NULL DEFAULT false,
    "old_final" DECIMAL(12,1),
    "baseline" DECIMAL(12,1),
    "note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condo_meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condo_iptu_years" (
    "year" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "total_area_m2" DECIMAL(10,2) NOT NULL,
    "first_month" INTEGER NOT NULL,
    "parcels" INTEGER NOT NULL,

    CONSTRAINT "condo_iptu_years_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "condo_recurring_items" (
    "id" UUID NOT NULL,
    "center_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL DEFAULT 0,
    "unit_cents" INTEGER,
    "default_qty" DECIMAL(10,2),
    "active_from" DATE NOT NULL,
    "active_to" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "condo_recurring_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condo_periods" (
    "id" UUID NOT NULL,
    "month" CHAR(7) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "CondoPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "tariff" DECIMAL(12,7) NOT NULL,
    "flag" TEXT NOT NULL DEFAULT 'VERDE',
    "flag_factor" DECIMAL(6,4) NOT NULL,
    "snack_bar_pct" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "notes" TEXT,
    "snapshot" JSONB,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMP(3),
    "closed_by" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condo_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condo_expenses" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "group" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "kind" "CondoExpenseKind" NOT NULL DEFAULT 'VARIABLE',
    "confirmed" BOOLEAN NOT NULL DEFAULT true,
    "memo" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "condo_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condo_period_centers" (
    "period_id" UUID NOT NULL,
    "center_id" UUID NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 0,
    "billing" "CondoBilling" NOT NULL DEFAULT 'FULL',

    CONSTRAINT "condo_period_centers_pkey" PRIMARY KEY ("period_id","center_id")
);

-- CreateTable
CREATE TABLE "condo_period_items" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "center_id" UUID NOT NULL,
    "recurring_item_id" UUID,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(10,2),
    "unit_cents" INTEGER,
    "amount_cents" INTEGER NOT NULL DEFAULT 0,
    "adhoc" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "condo_period_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condo_charges" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "center_id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "center_name" TEXT NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "lines" JSONB NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "CondoChargeStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "paid_at" DATE,
    "paid_cents" INTEGER,
    "payment_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condo_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "condo_centers_name_key" ON "condo_centers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "condo_meter_readings_meter_id_month_key" ON "condo_meter_readings"("meter_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "condo_periods_month_key" ON "condo_periods"("month");

-- CreateIndex
CREATE INDEX "condo_expenses_period_id_sort_order_idx" ON "condo_expenses"("period_id", "sort_order");

-- CreateIndex
CREATE INDEX "condo_period_items_period_id_center_id_idx" ON "condo_period_items"("period_id", "center_id");

-- CreateIndex
CREATE UNIQUE INDEX "condo_charges_period_id_center_id_key" ON "condo_charges"("period_id", "center_id");

-- AddForeignKey
ALTER TABLE "condo_meters" ADD CONSTRAINT "condo_meters_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "condo_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condo_meter_readings" ADD CONSTRAINT "condo_meter_readings_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "condo_meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condo_recurring_items" ADD CONSTRAINT "condo_recurring_items_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "condo_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condo_expenses" ADD CONSTRAINT "condo_expenses_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "condo_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condo_period_centers" ADD CONSTRAINT "condo_period_centers_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "condo_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condo_period_centers" ADD CONSTRAINT "condo_period_centers_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "condo_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condo_period_items" ADD CONSTRAINT "condo_period_items_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "condo_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condo_charges" ADD CONSTRAINT "condo_charges_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "condo_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condo_charges" ADD CONSTRAINT "condo_charges_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "condo_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

