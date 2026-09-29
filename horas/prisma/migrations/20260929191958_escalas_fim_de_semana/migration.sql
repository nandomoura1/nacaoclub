-- AlterTable
ALTER TABLE "class_occurrences" ADD COLUMN     "duty_shift_id" UUID;

-- CreateTable
CREATE TABLE "duty_sectors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "modality_id" UUID NOT NULL,
    "defaults" JSONB NOT NULL DEFAULT '{}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "duty_sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_shifts" (
    "id" UUID NOT NULL,
    "sector_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_min" INTEGER NOT NULL,
    "end_min" INTEGER NOT NULL,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duty_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_assignments" (
    "shift_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "note" TEXT,

    CONSTRAINT "duty_assignments_pkey" PRIMARY KEY ("shift_id","teacher_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "duty_sectors_name_key" ON "duty_sectors"("name");

-- CreateIndex
CREATE INDEX "duty_shifts_date_sector_id_idx" ON "duty_shifts"("date", "sector_id");

-- AddForeignKey
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_duty_shift_id_fkey" FOREIGN KEY ("duty_shift_id") REFERENCES "duty_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_sectors" ADD CONSTRAINT "duty_sectors_modality_id_fkey" FOREIGN KEY ("modality_id") REFERENCES "modalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_shifts" ADD CONSTRAINT "duty_shifts_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "duty_sectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "duty_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regras que o banco garante sozinho.
ALTER TABLE "duty_shifts" ADD CONSTRAINT "duty_shift_range" CHECK ("start_min" >= 0 AND "end_min" <= 1440 AND "end_min" > "start_min");

-- Brinquedoteca vira modalidade (Contraturno / Kids) e Monitor(a) vira cargo.
INSERT INTO "modalities" ("id", "name", "area_id", "color", "default_duration_min", "sort_order", "updated_at")
SELECT gen_random_uuid(), 'Brinquedoteca', a."id", '#F59E0B', 60, 100, CURRENT_TIMESTAMP
FROM "coordination_areas" a WHERE a."name" = 'Contraturno / Kids'
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "positions" ("id", "name", "sort_order", "updated_at")
VALUES (gen_random_uuid(), 'Monitor(a)', 10, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Setores com os turnos padrão da Nação (minutos desde a meia-noite).
INSERT INTO "duty_sectors" ("id", "name", "modality_id", "defaults", "sort_order")
SELECT gen_random_uuid(), s.name, m."id", s.defaults::jsonb, s.ord
FROM (VALUES
  ('Academia', 'Musculação', '{"SAB": [[420, 1020]], "DOM": [[480, 840]], "FERIADO": [[480, 840]]}', 1),
  ('CrossFit e HYROX', 'CrossFit', '{"SAB": [[420, 660]], "DOM": [], "FERIADO": []}', 2),
  ('Aulas Coletivas', 'Funcional', '{"SAB": [], "DOM": [], "FERIADO": []}', 3),
  ('Futevôlei', 'Futevôlei', '{"SAB": [], "DOM": [], "FERIADO": []}', 4),
  ('Brinquedoteca', 'Brinquedoteca', '{"SAB": [[480, 840]], "DOM": [], "FERIADO": []}', 5)
) AS s(name, modality, defaults, ord)
JOIN "modalities" m ON m."name" = s.modality
ON CONFLICT ("name") DO NOTHING;

-- Permissão nova: admin e coordenadores lançam escalas (cada um nos setores da sua área).
INSERT INTO "permissions" ("id", "key", "description")
VALUES (gen_random_uuid(), 'duty.edit', 'Lançar escalas de fim de semana e feriados')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."key" IN ('ADMIN', 'COORDENADOR') AND p."key" = 'duty.edit'
ON CONFLICT DO NOTHING;
