# contracts/news_contract.py
#
# Контракт обмена сообщениями между NestJS (publisher/consumer)
# и Python ML-сервисом (consumer/publisher).
#
# Зеркало contracts/news.contract.ts.
# Любые изменения синхронизировать с TypeScript-версией.

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ============================================================
# NATS: stream, subjects, consumer names
# ============================================================

NEWS_STREAM = "NEWS"


class NewsSubjects:
    """Имена subject'ов в NATS JetStream."""
    RAW = "news.raw"              # NestJS → Python
    PROCESSED = "news.processed"  # Python → NestJS
    FAILED = "news.failed"        # Python → NestJS


class NewsConsumers:
    """Durable consumer names."""
    ML_WORKER = "ml-worker"                  # Python читает news.raw
    BACKEND_PROCESSED = "backend-processed"  # NestJS читает news.processed и news.failed


# ============================================================
# Events
# ============================================================

class NewsRawEvent(BaseModel):
    """
    Событие "сырая новость" — приходит из NestJS (subject: news.raw).

    JSON использует camelCase, Python-поля — snake_case.
    populate_by_name=True позволяет принимать оба варианта.
    """
    id: str
    guid: str
    title: str
    description: Optional[str] = None
    full_text: Optional[str] = Field(None, alias="fullText")
    link: str
    source: str
    category: Optional[str] = None
    pub_date: datetime = Field(..., alias="pubDate")
    published_at: datetime = Field(..., alias="publishedAt")

    class Config:
        populate_by_name = True


class NewsProcessedEvent(BaseModel):
    """
    Результат обработки новости — уходит в NestJS (subject: news.processed).
    """
    article_id: str = Field(..., alias="articleId")
    guid: str
    company_id: str = Field(..., alias="companyId")
    is_relevant: bool = Field(..., alias="isRelevant")
    score: float
    summary: str
    explanation: str
    model: Optional[str] = None
    processed_at: datetime = Field(..., alias="processedAt")

    class Config:
        populate_by_name = True


class NewsFailedEvent(BaseModel):
    """
    Событие ошибки обработки — уходит в NestJS (subject: news.failed).
    """
    article_id: str = Field(..., alias="articleId")
    guid: str
    company_id: Optional[str] = Field(None, alias="companyId")
    reason: str
    attempt: int
    failed_at: datetime = Field(..., alias="failedAt")

    class Config:
        populate_by_name = True