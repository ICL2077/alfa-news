import asyncio
import json
import logging
import re
import time
import base64

from openai import (
    APIConnectionError,
    AsyncOpenAI,
    BadRequestError,
    InternalServerError,
    PermissionDeniedError,
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

_budget_until = 0.0
BUDGET_PAUSE = 900  # 15 минут


class BudgetExceeded(Exception):
    """Дневной бюджет ключа исчерпан (сброс в 3:00 МСК)."""


class AnswerTruncated(Exception):
    """Ответ обрезан по max_tokens: повтор даст то же самое и потратит бюджет."""


def budget_pause_left() -> float:
    return max(0.0, _budget_until - time.monotonic())


# max_retries=0: повторами управляет tenacity, иначе они перемножатся
_client = AsyncOpenAI(
    base_url=settings.llm_base_url,
    api_key=settings.llm_api_key or "unused",
    max_retries=0,
)
_sem = asyncio.Semaphore(settings.llm_concurrency)

# Повторяем только временные сбои и невалидный JSON.
# Ошибки авторизации, неверная модель, BudgetExceeded и AnswerTruncated повтором не лечатся.
_RETRYABLE = (APIConnectionError, RateLimitError, InternalServerError, ValidationError)

_THINK = re.compile(r"<think>.*?</think>", re.S | re.I)
_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.S | re.I)


def _extract_json(text: str) -> str:
    """Достаёт JSON-объект из ответа, убирая размышления и разметку."""
    text = _THINK.sub("", text).strip()
    m = _FENCE.search(text)
    if m:
        text = m.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        return text[start : end + 1]
    return text


async def _pace() -> None:
    """Растягивает вызовы во времени, чтобы не упираться в лимиты."""
    global _last_call
    if settings.llm_min_interval <= 0:
        return
    async with _pace_lock:
        wait = _last_call + settings.llm_min_interval - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call = time.monotonic()


async def _create(**kwargs):
    """Единая точка вызова API: пауза, семафор и распознавание ошибки бюджета."""
    global _budget_until
    if budget_pause_left() > 0:
        raise BudgetExceeded("LLM budget paused")

    await _pace()
    try:
        async with _sem:
            return await _client.chat.completions.create(**kwargs)
    except (BadRequestError, RateLimitError, PermissionDeniedError) as e:
        if "budget" in str(e).lower():
            _budget_until = time.monotonic() + BUDGET_PAUSE
            log.error("LLM budget exceeded, pause %ds: %s", BUDGET_PAUSE, e)
            raise BudgetExceeded(str(e)) from e
        raise

def _log_usage(model: str, resp) -> None:
    choice = resp.choices[0]
    if resp.usage:
        log.info(
            "llm %s: prompt=%s completion=%s tokens, finish=%s",
            model,
            resp.usage.prompt_tokens,
            resp.usage.completion_tokens,
            choice.finish_reason,
        )

def _fill_usage(usage: dict | None, resp) -> None:
    if usage is None:
        return
    usage.update(
        promptTokens=resp.usage.prompt_tokens if resp.usage else None,
        completionTokens=resp.usage.completion_tokens if resp.usage else None,
        finishReason=resp.choices[0].finish_reason,
    )


def _extra_body() -> dict | None:
    raw = settings.llm_extra_body.strip()
    return json.loads(raw) if raw else None


@retry(
    retry=retry_if_exception_type(_RETRYABLE),
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=2, min=3, max=30),
    reraise=True,
)
async def ask_json(system: str, user: str, schema: type[BaseModel], model: str, usage: dict | None = None):
    kwargs: dict = dict(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_tokens,
        timeout=settings.llm_timeout,
    )
    if settings.llm_json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    if (extra := _extra_body()) is not None:
        kwargs["extra_body"] = extra

    resp = await _create(**kwargs)
    _log_usage(model, resp)

    _fill_usage(usage, resp)

    if resp.choices[0].finish_reason == "length":
        raise AnswerTruncated(
            f"{model}: answer cut at max_tokens={settings.llm_max_tokens}"
        )

    # невалидный JSON или не та схема -> ValidationError -> tenacity повторит
    return schema.model_validate_json(
        _extract_json(resp.choices[0].message.content or "")
    )


@retry(
    retry=retry_if_exception_type((APIConnectionError, RateLimitError, InternalServerError)),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=3, max=20),
    reraise=True,
)
async def ask_text(messages: list[dict], model: str, max_tokens: int, usage: dict | None = None) -> str:
    """Свободный текстовый ответ (для чата)."""
    kwargs: dict = dict(
        model=model,
        messages=messages,
        temperature=0.3,
        max_tokens=max_tokens,
        timeout=settings.llm_timeout,
    )
    if (extra := _extra_body()) is not None:
        kwargs["extra_body"] = extra

    resp = await _create(**kwargs)
    _log_usage(model, resp)
    _fill_usage(usage, resp)
    return _THINK.sub("", resp.choices[0].message.content or "").strip()

@retry(
    retry=retry_if_exception_type((APIConnectionError, RateLimitError, InternalServerError)),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=3, max=20),
    reraise=True,
)
async def ask_vision(image_png: bytes, instruction: str, model: str, max_tokens: int) -> str:
    """Текст по картинке (OCR). Instruct-модель не рассуждает, extra_body не нужен."""
    data_url = "data:image/png;base64," + base64.b64encode(image_png).decode()
    resp = await _create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        temperature=0,
        max_tokens=max_tokens,
        timeout=settings.llm_timeout,
    )
    _log_usage(model, resp)
    return _THINK.sub("", resp.choices[0].message.content or "").strip()