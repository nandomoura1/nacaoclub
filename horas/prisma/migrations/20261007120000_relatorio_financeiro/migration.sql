-- CreateEnum
CREATE TYPE "FinPeriodStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED');

-- CreateEnum
CREATE TYPE "FinDocStatus" AS ENUM ('PROCESSING', 'EXTRACTED', 'PENDING_REVIEW', 'APPROVED', 'DIVERGENT', 'ERROR');

-- CreateEnum
CREATE TYPE "FinDocOrigin" AS ENUM ('UPLOAD', 'HISTORICO');

-- CreateEnum
CREATE TYPE "FinLineStatus" AS ENUM ('EXTRACTED', 'CONFIRMED', 'EDITED', 'MANUAL');

-- CreateEnum
CREATE TYPE "FinDataset" AS ENUM ('RECEITA', 'DESPESA', 'MODALIDADE', 'ALUNOS', 'PDV_RESUMO', 'PDV_PAGAMENTO', 'PDV_PRODUTO', 'CAIXA', 'INVESTIMENTO', 'FINANCIAMENTO', 'INDICADOR');

-- CreateTable
CREATE TABLE "fin_periods" (
    "id" UUID NOT NULL,
    "month" CHAR(7) NOT NULL,
    "status" "FinPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "manager_notes" TEXT,
    "partner_decisions" TEXT,
    "analysis" JSONB,
    "analysis_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_documents" (
    "id" UUID NOT NULL,
    "period_id" UUID,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "status" "FinDocStatus" NOT NULL DEFAULT 'PROCESSING',
    "origin" "FinDocOrigin" NOT NULL DEFAULT 'UPLOAD',
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "error" TEXT,
    "extraction" JSONB,
    "detected_month" CHAR(7),
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_document_files" (
    "document_id" UUID NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "fin_document_files_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "fin_categories" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "personnel" BOOLEAN NOT NULL DEFAULT false,
    "operating_revenue" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "fin_categories_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "fin_lines" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "dataset" "FinDataset" NOT NULL,
    "key" TEXT,
    "label" TEXT NOT NULL,
    "unit" TEXT,
    "amount_cents" INTEGER,
    "quantity" DECIMAL(14,2),
    "classification" TEXT,
    "meta" JSONB,
    "document_id" UUID,
    "source_ref" TEXT,
    "source_value" TEXT,
    "rule" TEXT,
    "status" "FinLineStatus" NOT NULL DEFAULT 'EXTRACTED',
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_versions" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fin_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_reconciliations" (
    "period_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_reconciliations_pkey" PRIMARY KEY ("period_id","key")
);

-- CreateTable
CREATE TABLE "fin_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "targets" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fin_periods_month_key" ON "fin_periods"("month");

-- CreateIndex
CREATE INDEX "fin_documents_period_id_kind_idx" ON "fin_documents"("period_id", "kind");

-- CreateIndex
CREATE INDEX "fin_lines_period_id_dataset_idx" ON "fin_lines"("period_id", "dataset");

-- CreateIndex
CREATE UNIQUE INDEX "fin_versions_period_id_number_key" ON "fin_versions"("period_id", "number");

-- AddForeignKey
ALTER TABLE "fin_documents" ADD CONSTRAINT "fin_documents_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "fin_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_document_files" ADD CONSTRAINT "fin_document_files_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fin_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_lines" ADD CONSTRAINT "fin_lines_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "fin_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_lines" ADD CONSTRAINT "fin_lines_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fin_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_versions" ADD CONSTRAINT "fin_versions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "fin_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_reconciliations" ADD CONSTRAINT "fin_reconciliations_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "fin_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Categorias padrão (editáveis em Financeiro → Configurações)
INSERT INTO "fin_categories" ("key", "label", "kind", "classification", "personnel", "operating_revenue", "sort_order") VALUES
  ('rec.servicos', 'Receitas de serviços', 'RECEITA', 'RECEITA', false, true, 0),
  ('rec.vendas', 'Receitas de vendas', 'RECEITA', 'RECEITA', false, true, 1),
  ('rec.aluguel_parceiros', 'Aluguel de parceiros', 'RECEITA', 'RECEITA', false, true, 2),
  ('rec.marketing', 'Marketing / patrocínios', 'RECEITA', 'RECEITA', false, true, 3),
  ('rec.rateio_condominio', 'Rateio de condomínio', 'RECEITA', 'RECEITA', false, true, 4),
  ('rec.eventos', 'Eventos', 'RECEITA', 'RECEITA', false, true, 5),
  ('rec.taxas', 'Taxas', 'RECEITA', 'RECEITA', false, true, 6),
  ('rec.outras', 'Outras receitas', 'RECEITA', 'RECEITA', false, true, 7),
  ('rec.estornos', 'Estornos / devoluções', 'RECEITA', 'RECEITA', false, true, 8),
  ('rec.aporte', 'Aporte de sócios', 'RECEITA', 'FINANCEIRO', false, false, 9),
  ('rec.emprestimo', 'Empréstimo / financiamento recebido', 'RECEITA', 'FINANCEIRO', false, false, 10),
  ('pessoal.salarios', 'Salários', 'DESPESA', 'OPEX', true, false, 11),
  ('pessoal.funap', 'FUNAP', 'DESPESA', 'OPEX', true, false, 12),
  ('pessoal.estagiarios', 'Estagiários', 'DESPESA', 'OPEX', true, false, 13),
  ('pessoal.vale_transporte', 'Vale-transporte', 'DESPESA', 'OPEX', true, false, 14),
  ('pessoal.fgts', 'FGTS', 'DESPESA', 'OPEX', true, false, 15),
  ('pessoal.ferias', 'Férias', 'DESPESA', 'OPEX', true, false, 16),
  ('pessoal.gratificacoes', 'Gratificações', 'DESPESA', 'OPEX', true, false, 17),
  ('pessoal.rescisoes', 'Rescisões', 'DESPESA', 'OPEX', true, false, 18),
  ('pessoal.decimo_terceiro', '13º salário', 'DESPESA', 'OPEX', true, false, 19),
  ('pessoal.encargos', 'Encargos patronais', 'DESPESA', 'OPEX', true, false, 20),
  ('pessoal.outros', 'Outros custos de folha', 'DESPESA', 'OPEX', true, false, 21),
  ('pessoal.irrf', 'IRRF retido (recolhimento)', 'DESPESA', 'OPEX', false, false, 22),
  ('pessoal.adiantamento', 'Adiantamento salarial', 'DESPESA', 'AJUSTE', false, false, 23),
  ('parceria.tenis', 'Repasse parceria do Tênis', 'DESPESA', 'OPEX', false, false, 24),
  ('desp.aluguel', 'Aluguel', 'DESPESA', 'OPEX', false, false, 25),
  ('desp.energia', 'Energia', 'DESPESA', 'OPEX', false, false, 26),
  ('desp.agua', 'Água', 'DESPESA', 'OPEX', false, false, 27),
  ('desp.impostos', 'Impostos', 'DESPESA', 'OPEX', false, false, 28),
  ('desp.materiais_revenda', 'Materiais para revenda (insumos)', 'DESPESA', 'OPEX', false, false, 29),
  ('desp.prestadores', 'Prestadores de serviço', 'DESPESA', 'OPEX', false, false, 30),
  ('desp.materiais_aplicados', 'Materiais aplicados', 'DESPESA', 'OPEX', false, false, 31),
  ('desp.obras', 'Obras e reformas', 'DESPESA', 'CAPEX', false, false, 32),
  ('desp.equipamentos', 'Equipamentos', 'DESPESA', 'CAPEX', false, false, 33),
  ('desp.cartoes', 'Cartões / tarifas', 'DESPESA', 'FINANCEIRO', false, false, 34),
  ('desp.manutencao', 'Manutenção', 'DESPESA', 'OPEX', false, false, 35),
  ('desp.marketing', 'Marketing', 'DESPESA', 'OPEX', false, false, 36),
  ('desp.administrativo', 'Administrativo', 'DESPESA', 'OPEX', false, false, 37),
  ('desp.emprestimo', 'Pagamento de empréstimo', 'DESPESA', 'FINANCEIRO', false, false, 38),
  ('desp.outras', 'Outras despesas', 'DESPESA', 'OPEX', false, false, 39),
  ('payout.distribuicao', 'Distribuição de lucros', 'DESPESA', 'DISTRIBUICAO', false, false, 40),
  ('payout.antecipacao', 'Antecipação de lucros', 'DESPESA', 'DISTRIBUICAO', false, false, 41),
  ('payout.retiradas', 'Outras retiradas dos sócios', 'DESPESA', 'DISTRIBUICAO', false, false, 42);
