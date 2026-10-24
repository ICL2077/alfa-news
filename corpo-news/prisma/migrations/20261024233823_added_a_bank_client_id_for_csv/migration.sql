-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "bankClientId" TEXT;

-- CreateIndex
CREATE INDEX "companies_bankClientId_idx" ON "companies"("bankClientId");
