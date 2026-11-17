-- Premiação (Escalas 5x2 → Premiação): gratificação mensal (até R$ 300) paga no dia 15 do mês seguinte.
-- award_people: quem participa, a equipe e o valor de cada critério (padrão R$ 100; Cozinha e outros podem ter outros valores).
CREATE TABLE IF NOT EXISTS "award_people" (
    "teacher_id" UUID NOT NULL,
    "group_name" TEXT NOT NULL,
    "productivity_cents" INTEGER NOT NULL DEFAULT 10000,
    "punctuality_cents" INTEGER NOT NULL DEFAULT 10000,
    "attendance_cents" INTEGER NOT NULL DEFAULT 10000,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "award_people_pkey" PRIMARY KEY ("teacher_id"),
    CONSTRAINT "award_people_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- award_months: avaliação do mês (mês avaliado "AAAA-MM"); sem linha = sugestão automática.
CREATE TABLE IF NOT EXISTS "award_months" (
    "teacher_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "productivity" BOOLEAN NOT NULL,
    "punctuality" BOOLEAN NOT NULL,
    "attendance" BOOLEAN NOT NULL,
    "extra_cents" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "award_months_pkey" PRIMARY KEY ("teacher_id", "month"),
    CONSTRAINT "award_months_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- award_closures: mês fechado (valores congelados em "snapshot") e pago.
CREATE TABLE IF NOT EXISTS "award_closures" (
    "month" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by_id" UUID,
    "paid_at" TIMESTAMP(3),
    "paid_by_id" UUID,
    CONSTRAINT "award_closures_pkey" PRIMARY KEY ("month")
);

INSERT INTO "permissions" ("id", "key", "description")
VALUES (gen_random_uuid(), 'award.view', 'Premiação: ver a avaliação e os valores da gratificação mensal'),
       (gen_random_uuid(), 'award.edit', 'Premiação: avaliar, ajustar valores, fechar o mês e registrar o pagamento')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."key" IN ('ADMIN', 'CONSULTA') AND p."key" IN ('award.view', 'award.edit')
ON CONFLICT DO NOTHING;
