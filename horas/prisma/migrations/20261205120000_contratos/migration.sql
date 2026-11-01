-- Contratos: modelos, contratos, partes que assinam e trilha de evidências.
-- CreateTable
CREATE TABLE IF NOT EXISTS "contract_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "body" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "signer_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "contracts" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "template_id" UUID,
    "company_id" UUID,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "values" JSONB NOT NULL DEFAULT '{}',
    "body" TEXT NOT NULL DEFAULT '',
    "body_hash" TEXT,
    "final_path" TEXT,
    "final_hash" TEXT,
    "notes" TEXT,
    "created_by" UUID,
    "sent_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "contract_signers" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "token_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "otp_hash" TEXT,
    "otp_expires_at" TIMESTAMP(3),
    "otp_sent_at" TIMESTAMP(3),
    "otp_attempts" INTEGER NOT NULL DEFAULT 0,
    "viewed_at" TIMESTAMP(3),
    "signed_at" TIMESTAMP(3),
    "signed_name" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "refused_reason" TEXT,

    CONSTRAINT "contract_signers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "contract_events" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "signer_id" UUID,
    "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "detail" JSONB,

    CONSTRAINT "contract_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "contract_templates_name_key" ON "contract_templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "contracts_code_key" ON "contracts"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contracts_status_created_at_idx" ON "contracts"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "contract_signers_token_hash_key" ON "contract_signers"("token_hash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contract_signers_contract_id_idx" ON "contract_signers"("contract_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contract_events_contract_id_at_idx" ON "contract_events"("contract_id", "at");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "contract_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_signers" ADD CONSTRAINT "contract_signers_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
