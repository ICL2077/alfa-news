ALTER TABLE "article_matches"
ADD COLUMN "actions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "alfaView" TEXT,
ADD COLUMN "sources" JSONB;
