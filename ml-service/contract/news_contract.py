# Зеркало contract/news.contract.ts. Менять только вместе с TypeScript-версией.
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

# ============================================================
# NATS: stream, subjects, consumer names
# ============================================================

NEWS_STREAM = "NEWS"


class NewsConsumers:
    """Durable-консьюмеры. Создаёт Nest (NatsBootstrapService), Python только подключается."""

    ML_RAW = "news_raw"                # Python читает news.raw.>
    NEST_PROCESSED = "news_processed"  # Nest читает news.processed.>


class NewsFilters:
    RAW = "news.raw.>"
    PROCESSED = "news.processed.>"


def subject_for_raw_news(article_id: str) -> str:
    return f"news.raw.{article_id}"


def subject_for_processed_news(company_id: str, article_id: str) -> str:
    # companyId обязателен в subject: иначе результаты для разных компаний
    # по одной новости считались бы дубликатами
    return f"news.processed.{company_id}.{article_id}"


# ============================================================
# Events
# ============================================================

class _Event(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class NewsRawEvent(_Event):
    """Сырая новость. NestJS -> Python (news.raw.<articleId>)."""

    id: str
    guid: str
    title: str
    description: Optional[str] = None
    full_text: Optional[str] = Field(None, alias="fullText")
    link: str
    category: Optional[str] = None
    pub_date: datetime = Field(..., alias="pubDate")
    published_at: datetime = Field(..., alias="publishedAt")


class NewsProcessedEvent(_Event):
    """
    Новость подошла компании. Python -> NestJS (news.processed.<companyId>.<articleId>).
    Событие шлётся ТОЛЬКО для совпадений: наличие записи в ArticleMatch означает релевантность.
    Nest-контракт требует articleId = RawArticle.id.
    """

    article_id: str = Field(..., alias="articleId")
    company_id: str = Field(..., alias="companyId")
    score: float  # 0..1
    summary: str
    explanation: str
    category: Optional[str] = None
    model: Optional[str] = None
    processed_at: datetime = Field(..., alias="processedAt")


class NewsFailedEvent(_Event):
    """Ошибка обработки. Python -> NestJS. В Nest пока нет subject и консьюмера, на будущее."""

    article_id: str = Field(..., alias="articleId")
    guid: str
    company_id: Optional[str] = Field(None, alias="companyId")
    reason: str
    attempt: int
    failed_at: datetime = Field(..., alias="failedAt")