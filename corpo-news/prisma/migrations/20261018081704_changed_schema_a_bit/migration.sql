/*
  Warnings:

  - You are about to drop the column `isRelevant` on the `article_matches` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('DRAFT', 'READY');

-- AlterTable
ALTER TABLE "article_matches" DROP COLUMN "isRelevant";

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "description" TEXT,
ADD COLUMN     "status" "ProfileStatus" NOT NULL DEFAULT 'DRAFT',
ALTER COLUMN "inn" DROP NOT NULL,
ALTER COLUMN "keywords" SET DEFAULT ARRAY[]::TEXT[];
