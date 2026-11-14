-- Benefícios da escala 5x2: alimentação por dia trabalhado, em centavos (vazio = sem direito).
ALTER TABLE "ws_members" ADD COLUMN IF NOT EXISTS "meal_daily_cents" INTEGER;
