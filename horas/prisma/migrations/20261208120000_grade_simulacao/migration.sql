-- Simulação de grade (rascunho para comparar horas e implantar a partir de uma data).
CREATE TABLE IF NOT EXISTS "grade_simulations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "area_id" UUID,
    "base_date" DATE NOT NULL,
    "effective_from" DATE,
    "items" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "created_by" UUID,
    "applied_at" TIMESTAMP(3),
    "applied_by" UUID,
    "applied_summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "grade_simulations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "grade_simulations_status_created_at_idx" ON "grade_simulations"("status", "created_at");
