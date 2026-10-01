-- Substituição por aula: a ausência pode valer só para uma aula da grade.
ALTER TABLE "leaves" ADD COLUMN "slot_id" UUID;
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "schedule_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "leaves_slot_id_idx" ON "leaves"("slot_id");
