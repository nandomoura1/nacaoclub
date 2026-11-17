-- Benefícios: alimentação dos professores escalados no fim de semana (Gestão de Horas → Escalas).
-- Valor por sábado e por domingo trabalhado no setor da escala (vazio = sem alimentação); entra nos
-- Benefícios do mês seguinte. Decisão 17/11: Academia R$ 20 no sábado e R$ 35 no domingo, acumulativo.
ALTER TABLE "duty_sectors" ADD COLUMN IF NOT EXISTS "meal_sat_cents" INTEGER;
ALTER TABLE "duty_sectors" ADD COLUMN IF NOT EXISTS "meal_sun_cents" INTEGER;
UPDATE "duty_sectors" SET "meal_sat_cents" = 2000, "meal_sun_cents" = 3500
WHERE "name" = 'Academia' AND "meal_sat_cents" IS NULL AND "meal_sun_cents" IS NULL;

-- DP / Financeiro (RH, DP e Financeiro) acessa o menu Escalas (fim de semana e feriados).
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."key" = 'CONSULTA' AND p."key" = 'duty.edit'
ON CONFLICT DO NOTHING;
