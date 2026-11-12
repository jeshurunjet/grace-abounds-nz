-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "sermonId" TEXT;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_sermonId_fkey" FOREIGN KEY ("sermonId") REFERENCES "Sermon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
