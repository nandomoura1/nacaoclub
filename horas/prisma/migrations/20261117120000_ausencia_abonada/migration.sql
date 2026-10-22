-- AlterTable
ALTER TABLE "class_assignments" ADD COLUMN     "absence_paid" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "leaves" ADD COLUMN     "deducts_hours" BOOLEAN NOT NULL DEFAULT true;

