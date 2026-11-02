-- Cronômetro de aula nas TVs do box (estado do timer da tela).
ALTER TABLE "tv_screens" ADD COLUMN IF NOT EXISTS "timer" JSONB;
