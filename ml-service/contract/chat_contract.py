from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

CHAT_STREAM = "CHAT"


class ChatConsumers:
    ML_REQUEST = "chat_request"      # durable, создаёт Nest, читает Python
    NEST_RESPONSE = "chat_response"  # durable, создаёт и читает Nest


class ChatFilters:
    REQUEST = "chat.request.>"
    RESPONSE = "chat.response.>"


def subject_for_chat_response(chat_id: str, reply_to_id: str) -> str:
    return f"chat.response.{chat_id}.{reply_to_id}"


class _Event(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class HistoryItem(_Event):
    role: str  # USER | AI
    content: str


class ChatCompany(_Event):
    name: str
    description: Optional[str] = None
    profile_json: Optional[dict[str, Any]] = Field(None, alias="profileJson")


class ChatArticle(_Event):
    title: str
    link: str
    description: Optional[str] = None
    full_text: Optional[str] = Field(None, alias="fullText")
    pub_date: Optional[str] = Field(None, alias="pubDate")


class ChatMatch(_Event):
    score: float
    category: Optional[str] = None
    impact: Optional[str] = None
    horizon: Optional[str] = None
    summary: Optional[str] = None
    explanation: Optional[str] = None


class ChatContext(_Event):
    company: ChatCompany
    article: ChatArticle
    match: ChatMatch


class ChatRequestEvent(_Event):
    """Nest -> Python (chat.request.<chatId>.<messageId>)."""

    chat_id: str = Field(..., alias="chatId")
    message_id: str = Field(..., alias="messageId")
    question: str
    history: list[HistoryItem] = []
    context: ChatContext
    requested_at: datetime = Field(..., alias="requestedAt")


class ChatResponseEvent(_Event):
    """Python -> Nest (chat.response.<chatId>.<replyToId>). Заполнено answer или error."""

    chat_id: str = Field(..., alias="chatId")
    reply_to_id: str = Field(..., alias="replyToId")
    answer: Optional[str] = None
    error: Optional[str] = None
    model: Optional[str] = None
    responded_at: datetime = Field(..., alias="respondedAt")