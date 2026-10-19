import asyncio
import logging
import time

from openai import (
    APIConnectionError,
    AsyncOpenAI,
    InternalServerError,
    RateLimitError,
)
from pydantic import BaseModel, ValidationError
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .settings import settings

log = logging.getLogger("llm")

_pace_lock = asyncio.Lock()
_last_call = 0.0

# max_retries=0: повторами управляет tenacity, иначе они перемножатся
_client = AsyncOpenAI(
    base_url=settings.llm_base_url,
    api_key=settings.llm_api_key or "unused",
    max_retries=0,
)
_sem = asyncio.Semaphore(settings.llm_concurrency)  # защита от rate limit

# Повторяем только временные сбои и невалидный ответ модели.
# Ошибки авторизации и неверного имени модели повтором не лечатся.
_RETRYABLE = (APIConnectionError, RateLimitError, InternalServerError, ValidationError)


async def _pace() -> None:
    """Растягивает вызовы во времени, чтобы не упираться в лимит токенов в минуту."""
    global _last_call
    if settings.llm_min_interval <= 0:
        return
    async with _pace_lock:
        wait = _last_call + settings.llm_min_interval - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call = time.monotonic()


@retry(
    retry=retry_if_exception_type(_RETRYABLE),
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=2, min=3, max=30),
    reraise=True,
)
async def ask_json(system: str, user: str, schema: type[BaseModel], model: str):
    await _pace()
    async with _sem:
        resp = await _client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            timeout=settings.llm_timeout,
            extra_body={"reasoning_effort": "low"},
        )

    if resp.usage:
        log.info(
            "llm %s: prompt=%s completion=%s tokens",
            model,
            resp.usage.prompt_tokens,
            resp.usage.completion_tokens,
        )
    # невалидный JSON или не та схема -> ValidationError -> tenacity повторит
    return schema.model_validate_json(resp.choices[0].message.content or "")