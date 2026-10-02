-- Domingo e feriado valem o dobro para quem trabalha. A regra vale a partir do
-- início da primeira competência gerada: competências anteriores não mudam.
ALTER TABLE "app_settings" ADD COLUMN "double_hours_from" DATE;
UPDATE "app_settings"
SET "double_hours_from" = (SELECT MIN("start_date") FROM "payroll_periods" WHERE "generated_at" IS NOT NULL)
WHERE "id" = 1;
