-- CreateTable
CREATE TABLE "wa_inbound" (
    "id" UUID NOT NULL,
    "message_id" TEXT NOT NULL,
    "phone_key" TEXT NOT NULL,
    "to_masked" TEXT NOT NULL,
    "sender_name" TEXT,
    "text" TEXT,
    "teacher_id" UUID,
    "user_id" UUID,
    "handled" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_inbound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_confirmations" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "teacher_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "reply" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replied_at" TIMESTAMP(3),

    CONSTRAINT "wa_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wa_inbound_message_id_key" ON "wa_inbound"("message_id");

-- CreateIndex
CREATE INDEX "wa_inbound_created_at_idx" ON "wa_inbound"("created_at");

-- CreateIndex
CREATE INDEX "wa_inbound_phone_key_idx" ON "wa_inbound"("phone_key");

-- CreateIndex
CREATE INDEX "wa_confirmations_phone_key_status_idx" ON "wa_confirmations"("phone_key", "status");

-- CreateIndex
CREATE UNIQUE INDEX "wa_confirmations_kind_period_teacher_id_key" ON "wa_confirmations"("kind", "period", "teacher_id");

