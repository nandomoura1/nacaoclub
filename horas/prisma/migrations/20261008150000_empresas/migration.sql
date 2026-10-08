-- CreateEnum
CREATE TYPE "CompanyDocKind" AS ENUM ('CONTRATO_SOCIAL', 'ALTERACAO_CONTRATUAL', 'CARTAO_CNPJ', 'LICENCA_FUNCIONAMENTO', 'ALVARA_BOMBEIROS', 'PROCURACAO', 'CERTIDAO', 'INFORMACOES_BANCARIAS', 'CONTRATO', 'OUTRO');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "cnpj" CHAR(14),
    "state_registration" TEXT,
    "municipal_registration" TEXT,
    "opening_date" DATE,
    "tax_regime" TEXT,
    "main_activity" TEXT,
    "address" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "legal_representative" TEXT,
    "accountant" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_bank_accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "bank" TEXT NOT NULL,
    "agency" TEXT,
    "account" TEXT,
    "account_type" TEXT,
    "pix_key" TEXT,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "company_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_documents" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "kind" "CompanyDocKind" NOT NULL,
    "title" TEXT,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "valid_from" DATE,
    "valid_until" DATE,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_document_files" (
    "document_id" UUID NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "company_document_files_pkey" PRIMARY KEY ("document_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_cnpj_key" ON "companies"("cnpj");

-- CreateIndex
CREATE INDEX "company_bank_accounts_company_id_idx" ON "company_bank_accounts"("company_id");

-- CreateIndex
CREATE INDEX "company_documents_company_id_kind_idx" ON "company_documents"("company_id", "kind");

-- AddForeignKey
ALTER TABLE "company_bank_accounts" ADD CONSTRAINT "company_bank_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_document_files" ADD CONSTRAINT "company_document_files_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "company_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

