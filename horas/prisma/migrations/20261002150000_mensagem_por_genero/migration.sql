-- Mensagem geral aos professores por gênero: Musculação (Nação Fit) × Aulas Coletivas.
ALTER TABLE "app_settings" ADD COLUMN "gym_guidelines" TEXT;

-- Leva os textos já salvos por área: a área da Musculação vira a mensagem da Musculação;
-- a primeira das demais áreas com texto vira a mensagem das Aulas Coletivas.
UPDATE "app_settings" SET
  "gym_guidelines" = COALESCE("gym_guidelines", (
    SELECT a."teacher_guidelines" FROM "coordination_areas" a
    WHERE a."teacher_guidelines" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "modalities" m WHERE m."area_id" = a."id" AND m."name" ILIKE '%muscula%')
    ORDER BY a."sort_order" LIMIT 1)),
  "teacher_guidelines" = COALESCE("teacher_guidelines", (
    SELECT a."teacher_guidelines" FROM "coordination_areas" a
    WHERE a."teacher_guidelines" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "modalities" m WHERE m."area_id" = a."id" AND m."name" ILIKE '%muscula%')
    ORDER BY a."sort_order" LIMIT 1))
WHERE "id" = 1;
