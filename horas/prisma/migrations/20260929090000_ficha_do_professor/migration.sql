-- Falta de um dia vira ausência como as outras (lançada na ficha do professor).
ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'FALTA';

-- Ausência anulada: as aulas voltam ao previsto; o registro fica.
ALTER TABLE "leaves" ADD COLUMN "cancelled_at" TIMESTAMP(3),
ADD COLUMN "cancelled_by" UUID;
