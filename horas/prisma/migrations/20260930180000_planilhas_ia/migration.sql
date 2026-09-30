-- Planilhas de treino geradas pela IA (estratégia + aulas por dia).
CREATE TABLE "training_programs" (
    "id" UUID NOT NULL,
    "modality" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "request" JSONB NOT NULL,
    "plan" JSONB NOT NULL,
    "days" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_programs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "training_programs_modality_created_at_idx" ON "training_programs"("modality", "created_at");
