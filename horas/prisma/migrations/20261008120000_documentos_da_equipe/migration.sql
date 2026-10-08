-- CreateEnum
CREATE TYPE "StaffDocKind" AS ENUM ('IDENTIDADE', 'CREF', 'CONTRATO_TRABALHO', 'CONTRATO_ESTAGIO', 'OUTRO');

-- CreateTable
CREATE TABLE "teacher_documents" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "kind" "StaffDocKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "valid_from" DATE,
    "valid_until" DATE,
    "number" TEXT,
    "notes" TEXT,
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_document_files" (
    "document_id" UUID NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "teacher_document_files_pkey" PRIMARY KEY ("document_id")
);

-- CreateIndex
CREATE INDEX "teacher_documents_teacher_id_kind_idx" ON "teacher_documents"("teacher_id", "kind");

-- AddForeignKey
ALTER TABLE "teacher_documents" ADD CONSTRAINT "teacher_documents_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_document_files" ADD CONSTRAINT "teacher_document_files_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "teacher_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

