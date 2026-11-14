-- Benefícios (Escalas 5x2 → Benefícios): ajuste do mês informado pelo DP e pessoas fora das escalas.
-- benefit_months: dias a pagar de passagem informados à mão no mês (substituem o cálculo) e/ou valor fixo do mês.
CREATE TABLE IF NOT EXISTS "benefit_months" (
    "teacher_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "transport_days" INTEGER,
    "transport_total_cents" INTEGER,
    "note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "benefit_months_pkey" PRIMARY KEY ("teacher_id", "month"),
    CONSTRAINT "benefit_months_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- benefit_people: quem recebe benefício sem estar numa equipe da escala 5x2 (professores, Kids…).
CREATE TABLE IF NOT EXISTS "benefit_people" (
    "teacher_id" UUID NOT NULL,
    "transport_daily_cents" INTEGER,
    "meal_daily_cents" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "benefit_people_pkey" PRIMARY KEY ("teacher_id"),
    CONSTRAINT "benefit_people_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
