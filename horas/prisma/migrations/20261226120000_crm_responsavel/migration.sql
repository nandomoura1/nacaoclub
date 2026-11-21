-- Cobrança e CRM: responsável = consultor do cadastro do aluno na Tecnofit; atraso > 30 dias = Líder Comercial (decisão 21/11).
ALTER TABLE "tec_customers" ADD COLUMN IF NOT EXISTS "consultant_checked_on" DATE;
ALTER TABLE "crm_cases" ADD COLUMN IF NOT EXISTS "owner_manual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "crm_leader_user_id" UUID;
