-- AlterTable
ALTER TABLE "duty_sectors" ADD COLUMN     "counts_hours" BOOLEAN NOT NULL DEFAULT true;

-- "Aulas Coletivas" vira "Aulões": o professor cobra dos próprios alunos e não é
-- remunerado pela Nação, então a escala não gera horas.
UPDATE "duty_sectors" SET "name" = 'Aulões', "counts_hours" = false WHERE "name" = 'Aulas Coletivas';
-- Horas que já tivessem sido geradas por esse setor saem (competências abertas).
DELETE FROM "class_occurrences" o
USING "duty_shifts" sh, "duty_sectors" s, "payroll_periods" p
WHERE o."duty_shift_id" = sh."id" AND sh."sector_id" = s."id" AND s."counts_hours" = false
  AND o."period_id" = p."id" AND p."status" <> 'FECHADO';
