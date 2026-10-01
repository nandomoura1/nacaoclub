-- Orientações (conduta, tarefas, rotina) no texto da grade compartilhado com o professor.
ALTER TABLE "app_settings" ADD COLUMN "teacher_guidelines" TEXT;
ALTER TABLE "teachers" ADD COLUMN "guidelines" TEXT;
