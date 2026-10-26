-- CreateTable
CREATE TABLE "raw_articles" (
    "id" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "description" TEXT,
    "fullText" TEXT,
    "category" TEXT,
    "pubDate" TIMESTAMP(3) NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "inn" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "okved" TEXT,
    "region" TEXT,
    "keywords" TEXT[],
    "profileJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_matches" (
    "id" TEXT NOT NULL,
    "rawArticleId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "summary" TEXT,
    "explanation" TEXT,
    "isRelevant" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "raw_articles_guid_key" ON "raw_articles"("guid");

-- CreateIndex
CREATE INDEX "raw_articles_pubDate_idx" ON "raw_articles"("pubDate");

-- CreateIndex
CREATE UNIQUE INDEX "companies_inn_key" ON "companies"("inn");

-- CreateIndex
CREATE INDEX "article_matches_companyId_score_idx" ON "article_matches"("companyId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "article_matches_rawArticleId_companyId_key" ON "article_matches"("rawArticleId", "companyId");

-- AddForeignKey
ALTER TABLE "article_matches" ADD CONSTRAINT "article_matches_rawArticleId_fkey" FOREIGN KEY ("rawArticleId") REFERENCES "raw_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_matches" ADD CONSTRAINT "article_matches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
