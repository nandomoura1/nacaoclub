-- Uma pessoa pode ter mais de um cadastro de professor (ex.: CrossFit e Nação Fit).
CREATE TABLE "user_teachers" (
    "user_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    CONSTRAINT "user_teachers_pkey" PRIMARY KEY ("user_id", "teacher_id")
);
CREATE UNIQUE INDEX "user_teachers_teacher_id_key" ON "user_teachers"("teacher_id");
ALTER TABLE "user_teachers" ADD CONSTRAINT "user_teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_teachers" ADD CONSTRAINT "user_teachers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Leva os vínculos que já existiam (users.teacher_id) e remove a coluna antiga.
INSERT INTO "user_teachers" ("user_id", "teacher_id") SELECT "id", "teacher_id" FROM "users" WHERE "teacher_id" IS NOT NULL;
ALTER TABLE "users" DROP CONSTRAINT "users_teacher_id_fkey";
DROP INDEX "users_teacher_id_key";
ALTER TABLE "users" DROP COLUMN "teacher_id";
