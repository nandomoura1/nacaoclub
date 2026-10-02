-- Perfil Professor: usuário vinculado ao professor (extrato próprio) e treinos de Personal por aula.
ALTER TABLE "users" ADD COLUMN "teacher_id" UUID;
CREATE UNIQUE INDEX "users_teacher_id_key" ON "users"("teacher_id");
ALTER TABLE "users" ADD CONSTRAINT "users_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "personal_workouts" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "slot_id" UUID,
    "date" DATE NOT NULL,
    "start_min" INTEGER,
    "student" TEXT,
    "title" TEXT NOT NULL,
    "goal" TEXT,
    "blocks" JSONB NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "personal_workouts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "personal_workouts_teacher_id_date_idx" ON "personal_workouts"("teacher_id", "date");
ALTER TABLE "personal_workouts" ADD CONSTRAINT "personal_workouts_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personal_workouts" ADD CONSTRAINT "personal_workouts_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "schedule_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vincula automaticamente quem tem papel Professor ao professor com o mesmo e-mail (só quando há exatamente um).
UPDATE "users" u SET "teacher_id" = t."id"
FROM "teachers" t
WHERE u."teacher_id" IS NULL
  AND t."email" IS NOT NULL AND lower(t."email") = lower(u."email")
  AND (SELECT count(*) FROM "teachers" t2 WHERE t2."email" IS NOT NULL AND lower(t2."email") = lower(u."email")) = 1
  AND EXISTS (SELECT 1 FROM "user_roles" ur JOIN "roles" r ON r."id" = ur."role_id" WHERE ur."user_id" = u."id" AND r."key" = 'PROFESSOR');
