-- Atas de reunião: arquivos para download (propostas, projetos, apresentações…), no bucket privado.
CREATE TABLE IF NOT EXISTS "proc_meeting_files" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OUTRO',
    "path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "proc_meeting_files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "proc_meeting_files_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "proc_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "proc_meeting_files_meeting_id_idx" ON "proc_meeting_files" ("meeting_id");
