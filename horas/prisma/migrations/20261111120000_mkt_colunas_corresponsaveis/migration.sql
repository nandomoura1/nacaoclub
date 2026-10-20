-- AlterTable
ALTER TABLE "mkt_areas" ADD COLUMN     "co_owner_ids" UUID[] DEFAULT ARRAY[]::UUID[];

-- AlterTable
ALTER TABLE "mkt_tasks" ADD COLUMN     "column_id" UUID;

-- CreateTable
CREATE TABLE "mkt_board_columns" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "stage" "MktTaskColumn" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mkt_board_columns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mkt_tasks_column_id_idx" ON "mkt_tasks"("column_id");

-- AddForeignKey
ALTER TABLE "mkt_tasks" ADD CONSTRAINT "mkt_tasks_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "mkt_board_columns"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Colunas iniciais = as etapas fixas de antes (mesmos nomes e ordem).
INSERT INTO "mkt_board_columns" ("id", "name", "stage", "position") VALUES
  (gen_random_uuid(), 'Backlog', 'BACKLOG', 0),
  (gen_random_uuid(), 'Próximas campanhas', 'PROXIMAS', 1),
  (gen_random_uuid(), 'Esta semana', 'SEMANA', 2),
  (gen_random_uuid(), 'Em produção', 'PRODUCAO', 3),
  (gen_random_uuid(), 'Aguardando aprovação', 'APROVACAO', 4),
  (gen_random_uuid(), 'Programado', 'PROGRAMADO', 5),
  (gen_random_uuid(), 'Publicado / executado', 'EXECUTADO', 6),
  (gen_random_uuid(), 'Resultados', 'RESULTADOS', 7);
UPDATE "mkt_tasks" t SET "column_id" = c."id" FROM "mkt_board_columns" c WHERE c."stage" = t."column";
