import asyncio
import logging
from datetime import datetime, timezone

import nats
from nats.errors import TimeoutError as NatsTimeout
from nats.js.api import AckPolicy, ConsumerConfig, DeliverPolicy
from openai import (
    AuthenticationError,
    BadRequestError,
    NotFoundError,
    PermissionDeniedError,
)
from contract.chat_contract import (
    CHAT_STREAM,
    ChatConsumers,
    ChatFilters,
    ChatRequestEvent,
    ChatResponseEvent,
    subject_for_chat_response,
)
from pydantic import ValidationError
from .chat import answer_question
from contract.company_contract import (
    COMPANY_STREAM,
    CompanyConsumers,
    CompanyEnrichedEvent,
    CompanyEnrichEvent,
    CompanyFilters,
    CompanyReadyEvent,
    subject_for_enriched,
)
from contract.news_contract import (
    NEWS_STREAM,
    NewsConsumers,
    NewsFilters,
    NewsProcessedEvent,
    NewsRawEvent,
    subject_for_processed_news,
)

from .enrich import enrich_company
from .llm import AnswerTruncated, BudgetExceeded, budget_pause_left
from .registry import registry
from .scoring import score_news
from .settings import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
for _name in ("httpx", "httpx2", "httpcore", "httpcore2", "openai"):
    logging.getLogger(_name).setLevel(logging.WARNING)
log = logging.getLogger("ml")

# повтор не поможет: ключ, модель, формат запроса неверны или ответ обрезан
_FATAL = (
    AuthenticationError,
    NotFoundError,
    PermissionDeniedError,
    BadRequestError,
    AnswerTruncated,
)

CHAT_MAX_DELIVER = 5

BUDGET_RETRY_DELAY = 900  # сек, совпадает с паузой в llm.py


async def keepalive(msg, every: float = 10) -> None:
    """Пока идёт долгая обработка, говорим серверу «я работаю»."""
    while True:
        await asyncio.sleep(every)
        await msg.in_progress()


async def _wait_budget() -> bool:
    """Если бюджет исчерпан, ждём и сообщаем циклу, что пора пропустить итерацию."""
    left = budget_pause_left()
    if left > 0:
        await asyncio.sleep(min(left, 30))
        return True
    return False


# ---------------- компании: обогащение ----------------

async def handle_enrich(js, msg) -> None:
    try:
        event = CompanyEnrichEvent.model_validate_json(msg.data)
    except (ValidationError, ValueError) as e:
        log.warning("bad enrich event on %s: %s", msg.subject, e)
        await msg.term()
        return

    log.info("enrich request: %s (%s)", event.company_id, event.name)

    hb = asyncio.create_task(keepalive(msg))
    try:
        keywords, profile = await enrich_company(event)
    finally:
        hb.cancel()

    out = CompanyEnrichedEvent(
        company_id=event.company_id,
        keywords=keywords,
        profile_json=profile,
        enriched_at=datetime.now(timezone.utc),
    )
    await js.publish(
        subject_for_enriched(event.company_id),
        out.model_dump_json(by_alias=True).encode(),
        headers={
            "Nats-Msg-Id": f"{event.company_id}:enriched:{out.enriched_at.isoformat()}"
        },
    )

    # подтверждаем только после успешной публикации ответа
    await msg.ack()
    log.info("enriched published: %s keywords=%d", event.company_id, len(keywords))


async def enrich_loop(js) -> None:
    psub = await js.pull_subscribe(
        CompanyFilters.ENRICH,
        durable=CompanyConsumers.ML_ENRICH,
        stream=COMPANY_STREAM,
    )
    log.info("listening %s (mode=%s)", CompanyFilters.ENRICH, settings.llm_mode)

    while True:
        if await _wait_budget():
            continue
        try:
            msgs = await psub.fetch(batch=3, timeout=5)
        except NatsTimeout:
            continue

        for msg in msgs:
            try:
                await handle_enrich(js, msg)
            except BudgetExceeded:
                log.warning("LLM budget exceeded, enrich retry in %ds", BUDGET_RETRY_DELAY)
                await msg.nak(delay=BUDGET_RETRY_DELAY)
            except _FATAL as e:
                # компания останется в DRAFT: после исправления повтори POST /companies/:id/enrich
                log.error("enrich fatal, message dropped: %s: %s", type(e).__name__, e)
                await msg.term()
            except Exception:
                log.exception("enrich failed, will retry in 30s")
                await msg.nak(delay=30)


# ---------------- компании: реестр готовых ----------------

async def ready_subscribe(js):
    async def on_ready(msg) -> None:
        try:
            registry.upsert(CompanyReadyEvent.model_validate_json(msg.data))
        except (ValidationError, ValueError) as e:
            log.warning("bad ready event on %s: %s", msg.subject, e)

    # Эфемерный консьюмер: на каждом старте получает последнее сообщение
    # по каждой компании (снимок), затем новые в реальном времени.
    sub = await js.subscribe(
        CompanyFilters.READY,
        stream=COMPANY_STREAM,
        cb=on_ready,
        manual_ack=True,
        config=ConsumerConfig(
            deliver_policy=DeliverPolicy.LAST_PER_SUBJECT,
            ack_policy=AckPolicy.NONE,
        ),
    )
    log.info("subscribed %s (snapshot + live)", CompanyFilters.READY)
    return sub


# ---------------- новости ----------------

async def handle_news(js, msg) -> None:
    try:
        news = NewsRawEvent.model_validate_json(msg.data)
    except (ValidationError, ValueError) as e:
        log.warning("bad news event on %s: %s", msg.subject, e)
        await msg.term()
        return

    companies = registry.all()

    # пока идут вызовы LLM, продлеваем ожидание подтверждения
    hb = asyncio.create_task(keepalive(msg))
    try:
        results = await asyncio.gather(
            *(score_news(news, c) for c in companies), return_exceptions=True
        )
    finally:
        hb.cancel()

    published = 0
    failed = 0
    budget_hit = False
    fatal: Exception | None = None

    for company, res in zip(companies, results):
        if isinstance(res, BudgetExceeded):
            budget_hit = True
            continue
        if isinstance(res, AnswerTruncated):
            # одна обрезанная пара не должна ронять всю новость
            log.warning("scoring %s x %s truncated, skipped: %s", news.id[:8], company.name, res)
            continue
        if isinstance(res, _FATAL):
            fatal = res
            continue
        if isinstance(res, Exception):
            failed += 1
            log.error("scoring %s x %s failed: %r", news.id[:8], company.name, res)
            continue
        if res is None:
            continue

        out = NewsProcessedEvent(
            article_id=news.id,
            company_id=company.company_id,
            score=res.score,
            summary=res.summary,
            explanation=res.explanation,
            category=res.category,
            impact=res.impact,
            horizon=res.horizon,
            model=res.model,
            processed_at=datetime.now(timezone.utc),
        )
        await js.publish(
            subject_for_processed_news(company.company_id, news.id),
            out.model_dump_json(by_alias=True).encode(),
            # один результат на пару новость x компания
            headers={"Nats-Msg-Id": f"{news.id}:{company.company_id}"},
        )
        published += 1

    # успешные пары уже опубликованы; повторная публикация безопасна:
    # Nest делает upsert по паре (новость, компания)
    if budget_hit:
        raise BudgetExceeded("budget exceeded while scoring news")
    if fatal is not None:
        raise fatal
    if failed:
        raise RuntimeError(f"{failed} scoring calls failed")

    await msg.ack()
    log.info("news %s: companies=%d matched=%d", news.id[:8], len(companies), published)


async def _respond(js, req: ChatRequestEvent, *, answer=None, error=None, model=None) -> None:
    out = ChatResponseEvent(
        chat_id=req.chat_id,
        reply_to_id=req.message_id,
        answer=answer,
        error=error,
        model=model,
        responded_at=datetime.now(timezone.utc),
    )
    await js.publish(
        subject_for_chat_response(req.chat_id, req.message_id),
        out.model_dump_json(by_alias=True, exclude_none=True).encode(),
        headers={"Nats-Msg-Id": f"chat-response:{req.message_id}"},
    )


async def handle_chat(js, msg) -> None:
    try:
        req = ChatRequestEvent.model_validate_json(msg.data)
    except (ValidationError, ValueError) as e:
        log.warning("bad chat request on %s: %s", msg.subject, e)
        await msg.term()
        return

    hb = asyncio.create_task(keepalive(msg))
    try:
        answer = await answer_question(req)
    except BudgetExceeded:
        # пользователь ждёт, поэтому отвечаем ошибкой сразу, а не откладываем на 15 минут
        await _respond(js, req, error="Дневной лимит ИИ исчерпан, попробуйте позже")
        await msg.term()
        return
    except _FATAL as e:
        log.error("chat fatal: %s: %s", type(e).__name__, e)
        await _respond(js, req, error="Не удалось получить ответ, переформулируйте вопрос")
        await msg.term()
        return
    except Exception:
        if msg.metadata.num_delivered >= CHAT_MAX_DELIVER:
            # последняя попытка: не оставляем пользователя без ответа
            log.exception("chat failed finally")
            await _respond(js, req, error="Не удалось получить ответ, повторите вопрос")
            await msg.term()
            return
        raise
    finally:
        hb.cancel()

    await _respond(js, req, answer=answer, model=settings.llm_chat_model)
    await msg.ack()
    log.info("chat %s: answered (%d chars)", req.chat_id[:8], len(answer))


async def chat_loop(js) -> None:
    psub = await js.pull_subscribe(
        ChatFilters.REQUEST, durable=ChatConsumers.ML_REQUEST, stream=CHAT_STREAM
    )
    log.info("listening %s", ChatFilters.REQUEST)

    while True:
        if await _wait_budget():
            continue
        try:
            msgs = await psub.fetch(batch=2, timeout=5)
        except NatsTimeout:
            continue
        for msg in msgs:
            try:
                await handle_chat(js, msg)
            except Exception:
                log.exception("chat request failed, will retry in 10s")
                await msg.nak(delay=10)


async def news_loop(js) -> None:
    psub = await js.pull_subscribe(
        NewsFilters.RAW, durable=NewsConsumers.ML_RAW, stream=NEWS_STREAM
    )
    log.info("listening %s", NewsFilters.RAW)

    while True:
        if await _wait_budget():
            continue
        try:
            msgs = await psub.fetch(batch=3, timeout=5)
        except NatsTimeout:
            continue

        for msg in msgs:
            try:
                await handle_news(js, msg)
            except BudgetExceeded:
                log.warning("LLM budget exceeded, news retry in %ds", BUDGET_RETRY_DELAY)
                await msg.nak(delay=BUDGET_RETRY_DELAY)
            except _FATAL as e:
                log.error("news fatal, message dropped: %s: %s", type(e).__name__, e)
                await msg.term()
            except Exception:
                log.exception("news failed, will retry in 30s")
                await msg.nak(delay=30)


# ---------------- запуск ----------------

async def main() -> None:
    nc = await nats.connect(settings.nats_url)
    js = nc.jetstream()
    log.info("connected to %s", settings.nats_url)
    try:
        await ready_subscribe(js)
        await asyncio.sleep(2)  # дать снимку компаний загрузиться до первых новостей
        await asyncio.gather(enrich_loop(js), news_loop(js), chat_loop(js))
    finally:
        await nc.drain()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass