-- CreateTable
CREATE TABLE "edu_materials" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "area" TEXT NOT NULL,
    "category" TEXT,
    "format" TEXT NOT NULL,
    "url" TEXT,
    "path" TEXT,
    "file_name" TEXT,
    "mime" TEXT,
    "size_bytes" INTEGER,
    "audience" TEXT NOT NULL DEFAULT 'TODOS',
    "role_key" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT,
    "duration_min" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_completions" (
    "material_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_completions_pkey" PRIMARY KEY ("material_id","user_id")
);

-- CreateTable
CREATE TABLE "edu_tracks" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "audience" TEXT NOT NULL DEFAULT 'TODOS',
    "role_key" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_track_items" (
    "track_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "edu_track_items_pkey" PRIMARY KEY ("track_id","material_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "edu_materials_path_key" ON "edu_materials"("path");

-- CreateIndex
CREATE INDEX "edu_materials_area_active_idx" ON "edu_materials"("area", "active");

-- CreateIndex
CREATE INDEX "edu_completions_user_id_idx" ON "edu_completions"("user_id");

-- CreateIndex
CREATE INDEX "edu_track_items_track_id_position_idx" ON "edu_track_items"("track_id", "position");

-- AddForeignKey
ALTER TABLE "edu_completions" ADD CONSTRAINT "edu_completions_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "edu_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_track_items" ADD CONSTRAINT "edu_track_items_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "edu_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_track_items" ADD CONSTRAINT "edu_track_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "edu_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Trilha inicial (vazia): a diretoria e os líderes colocam os materiais.
INSERT INTO "edu_tracks" ("id", "name", "description", "audience", "sort_order", "updated_at") VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Onboarding do Colaborador Nação', 'O primeiro passo de todo colaborador: quem somos, como trabalhamos e os processos do dia a dia.', 'TODOS', 0, CURRENT_TIMESTAMP);
