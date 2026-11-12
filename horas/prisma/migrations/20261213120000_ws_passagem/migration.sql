-- Passagem (vale-transporte) da escala 5x2: valor por dia trabalhado (ida e volta), em centavos.
ALTER TABLE "ws_members" ADD COLUMN IF NOT EXISTS "transport_daily_cents" INTEGER;
