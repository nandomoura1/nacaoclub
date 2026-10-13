-- CreateEnum
CREATE TYPE "ProcDemandStatus" AS ENUM ('ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ProcPriority" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateTable
CREATE TABLE "proc_sectors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "leader_id" UUID,
    "task_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proc_sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proc_demands" (
    "id" UUID NOT NULL,
    "sector_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner_id" UUID,
    "requester_id" UUID,
    "due_date" DATE,
    "priority" "ProcPriority" NOT NULL DEFAULT 'MEDIA',
    "status" "ProcDemandStatus" NOT NULL DEFAULT 'ABERTA',
    "origin" TEXT NOT NULL DEFAULT 'DIRETORIA',
    "done_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proc_demands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proc_comments" (
    "id" UUID NOT NULL,
    "demand_id" UUID NOT NULL,
    "author_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proc_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proc_sectors_name_key" ON "proc_sectors"("name");

-- CreateIndex
CREATE INDEX "proc_demands_sector_id_status_idx" ON "proc_demands"("sector_id", "status");

-- CreateIndex
CREATE INDEX "proc_demands_owner_id_status_idx" ON "proc_demands"("owner_id", "status");

-- CreateIndex
CREATE INDEX "proc_comments_demand_id_created_at_idx" ON "proc_comments"("demand_id", "created_at");

-- AddForeignKey
ALTER TABLE "proc_demands" ADD CONSTRAINT "proc_demands_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "proc_sectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proc_comments" ADD CONSTRAINT "proc_comments_demand_id_fkey" FOREIGN KEY ("demand_id") REFERENCES "proc_demands"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Setores iniciais (líderes são definidos na tela Setores e líderes).
INSERT INTO "proc_sectors" ("id", "name", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'Esportes e modalidades', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nação Kids', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Lanchonete', 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Recepção e Comercial', 4, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Manutenção e Infraestrutura', 5, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Marketing', 6, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Financeiro e Administrativo', 7, CURRENT_TIMESTAMP);
