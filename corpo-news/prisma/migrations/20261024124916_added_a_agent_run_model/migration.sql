-- CreateEnum
CREATE TYPE "AgentRunKind" AS ENUM ('NEWS_MATCH', 'CHAT_ANSWER');

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "kind" "AgentRunKind" NOT NULL,
    "articleMatchId" TEXT,
    "messageId" TEXT,
    "model" TEXT,
    "durationMs" INTEGER,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_articleMatchId_key" ON "agent_runs"("articleMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_messageId_key" ON "agent_runs"("messageId");

-- CreateIndex
CREATE INDEX "agent_runs_kind_createdAt_idx" ON "agent_runs"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_articleMatchId_fkey" FOREIGN KEY ("articleMatchId") REFERENCES "article_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
