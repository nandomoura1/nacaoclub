-- Time do colaborador: professores (área fim) x equipe da escala 5x2 (área meio).
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "team" TEXT NOT NULL DEFAULT 'PROFESSOR';
CREATE INDEX IF NOT EXISTS "teachers_team_active_idx" ON "teachers"("team", "active");

-- Quem está numa escala 5x2 e nunca deu aula nem tem modalidade é da área meio.
UPDATE "teachers" t SET "team" = 'ESCALA'
WHERE EXISTS (SELECT 1 FROM "ws_members" m WHERE m."teacher_id" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "slot_version_teachers" s WHERE s."teacher_id" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "teacher_modalities" x WHERE x."teacher_id" = t."id");
