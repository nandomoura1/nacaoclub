-- Imagens anexadas aos cartões do Kanban de Marketing.
CREATE TABLE IF NOT EXISTS "mkt_task_attachments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mkt_task_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mkt_task_attachments_task_id_idx" ON "mkt_task_attachments"("task_id");
ALTER TABLE "mkt_task_attachments" ADD CONSTRAINT "mkt_task_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "mkt_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
