-- Benchmarks por modalidade: cada modalidade (CrossFit, Funcional, Hyrox,
-- Futevôlei) tem sua biblioteca. Os existentes são do CrossFit.
ALTER TABLE "workout_benchmarks" ADD COLUMN "modality" TEXT NOT NULL DEFAULT 'crossfit';

DROP INDEX "workout_benchmarks_name_key";
CREATE UNIQUE INDEX "workout_benchmarks_modality_name_key" ON "workout_benchmarks"("modality", "name");
