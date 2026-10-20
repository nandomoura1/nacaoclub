-- AlterEnum
ALTER TYPE "StaffDocKind" ADD VALUE 'ATESTADO';

-- AlterTable
ALTER TABLE "proc_meetings" ADD COLUMN     "agenda" TEXT,
ADD COLUMN     "guests" TEXT,
ADD COLUMN     "link" TEXT,
ADD COLUMN     "mode" TEXT,
ADD COLUMN     "participant_ids" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "title" TEXT;

