-- Contratos: vigência (ativo/inativo pelo prazo), encerramento antecipado e lixeira.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "starts_on" DATE;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "ends_on" DATE;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "terminated_on" DATE;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "termination_reason" TEXT;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "deleted_by" UUID;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "delete_reason" TEXT;
CREATE INDEX IF NOT EXISTS "contracts_deleted_at_idx" ON "contracts"("deleted_at");
