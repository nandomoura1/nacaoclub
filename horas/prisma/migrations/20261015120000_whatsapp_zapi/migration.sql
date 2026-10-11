-- CreateTable
CREATE TABLE "wa_messages" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "to_masked" TEXT NOT NULL,
    "preview" TEXT,
    "has_file" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "test_mode" BOOLEAN NOT NULL DEFAULT false,
    "provider_id" TEXT,
    "error" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wa_messages_created_at_idx" ON "wa_messages"("created_at");

