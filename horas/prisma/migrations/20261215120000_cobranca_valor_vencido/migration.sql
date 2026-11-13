-- Cobrança: valor VENCIDO separado do saldo do contrato (decisão 13/11).
-- A Tecnofit devolve, por venda, só o saldo (openValue) e a 1ª parcela em aberto (dueDate):
-- em plano anual/semestral parcelado o saldo inclui parcelas que ainda vão vencer.
ALTER TABLE "tec_debts" ADD COLUMN IF NOT EXISTS "installments" INTEGER;
ALTER TABLE "tec_debts" ADD COLUMN IF NOT EXISTS "sale_status" TEXT;
ALTER TABLE "tec_debts" ADD COLUMN IF NOT EXISTS "overdue_value" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "crm_cases" ADD COLUMN IF NOT EXISTS "overdue_value" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Estimativa inicial (a sincronização seguinte recalcula com o nº de parcelas da Tecnofit):
-- parcelas mensais vencidas desde a 1ª em aberto × valor da parcela (pelo nome do plano), limitado ao saldo.
UPDATE "tec_debts" t SET "overdue_value" = x.v
FROM (
  SELECT id, CASE
    WHEN due_date IS NULL OR due_date > CURRENT_DATE OR open_value <= 0 THEN 0
    ELSE LEAST(open_value, (
      (EXTRACT(YEAR FROM age(CURRENT_DATE, due_date)) * 12 + EXTRACT(MONTH FROM age(CURRENT_DATE, due_date)) + 1)
      * (CASE WHEN total_value > 0 THEN total_value ELSE open_value END)
      / (CASE WHEN description ILIKE '%anual%' THEN 12 WHEN description ILIKE '%semestral%' THEN 6 WHEN description ILIKE '%trimestral%' THEN 3 ELSE 1 END)
    ))
  END AS v
  FROM "tec_debts" WHERE status = 'ABERTO'
) x
WHERE t.id = x.id AND t."overdue_value" = 0;

UPDATE "crm_cases" c SET "overdue_value" = s.v
FROM (SELECT customer_id, ROUND(SUM(overdue_value), 2) AS v FROM "tec_debts" WHERE status = 'ABERTO' GROUP BY customer_id) s
WHERE c.customer_id = s.customer_id AND c.kind = 'COBRANCA' AND c.status = 'ABERTO' AND c."overdue_value" = 0;
