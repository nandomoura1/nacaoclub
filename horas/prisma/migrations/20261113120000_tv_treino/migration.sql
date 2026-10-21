-- CreateTable
CREATE TABLE "tv_screens" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "modality_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "pinned_date" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tv_screens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tv_screens_token_key" ON "tv_screens"("token");

-- AddForeignKey
ALTER TABLE "tv_screens" ADD CONSTRAINT "tv_screens_modality_id_fkey" FOREIGN KEY ("modality_id") REFERENCES "modalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

