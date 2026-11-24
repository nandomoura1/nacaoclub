-- Benefícios: equipe fora do cálculo (decisão 24/11, botão por equipe, reversível).
ALTER TABLE "ws_sectors" ADD COLUMN IF NOT EXISTS "benefits_off" BOOLEAN NOT NULL DEFAULT false;

-- Atraso do professor horista (decisão 24/11): 1h de atraso = 1h a menos na carga horária.
-- Desconta dos minutos das aulas do dia, a partir da primeira; `applied` guarda o antes/depois para anular.
CREATE TABLE IF NOT EXISTS "teacher_lateness" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "notes" TEXT,
    "applied" JSONB NOT NULL DEFAULT '[]',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" UUID,
    CONSTRAINT "teacher_lateness_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "teacher_lateness_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "teacher_lateness_teacher_id_date_idx" ON "teacher_lateness" ("teacher_id", "date");
