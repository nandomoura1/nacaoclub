-- Premiação em painel (como Benefícios): critério vazio = automático pela regra; atrasos > 15 min da competência.
ALTER TABLE "award_months" ALTER COLUMN "productivity" DROP NOT NULL;
ALTER TABLE "award_months" ALTER COLUMN "punctuality" DROP NOT NULL;
ALTER TABLE "award_months" ALTER COLUMN "attendance" DROP NOT NULL;
ALTER TABLE "award_months" ADD COLUMN IF NOT EXISTS "late_count" INTEGER NOT NULL DEFAULT 0;
