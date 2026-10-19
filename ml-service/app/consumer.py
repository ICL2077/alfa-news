import asyncio
import logging
from datetime import datetime, timezone
from nats.js.api import AckPolicy, ConsumerConfig, DeliverPolicy
from contract.news_contract import (
    NEWS_STREAM,
    NewsConsumers,
    NewsFilters,
    NewsProcessedEvent,
    NewsRawEvent,
    subject_for_processed_news,
)
from openai import (
    AuthenticationError,
    BadRequestError,
    NotFoundError,
    PermissionDeniedError,
)

from .scoring import score_news

from contract.company_contract import CompanyReadyEvent 

from .registry import registry

import nats
from nats.errors import TimeoutError as NatsTimeout
from pydantic import ValidationError

_FATAL = (AuthenticationError, NotFoundError, PermissionDeniedError, BadRequestError)

from contract.company_contract import (
    COMPANY_STREAM,
    CompanyConsumers,
    CompanyEnrichedEvent,
    CompanyEnrichEvent,
    CompanyFilters,
    subject_for_enriched,
)

from .enrich import enrich_company
from .settings import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ml")


async def keepalive(msg, every: float = 10) -> None:
    """Пока идёт долгая обработка, говорим серверу «я работаю», чтобы он не переотправил сообщение."""
    while True:
        await asyncio.sleep(every)
        await msg.in_progress()


async def handle_enrich(js, msg) -> None:
    # 1. Разбор и валидация. Битое сообщение повторять бессмысленно: term
    try:
        event = CompanyEnrichEvent.model_validate_json(msg.data)
    except (ValidationError, ValueError) as e:
        log.warning("bad enrich event on %s: %s", msg.subject, e)
        await msg.term()
        return

    log.info("enrich request: %s (%s)", event.company_id, event.name)

    # 2. Обработка (позже здесь LLM)
    hb = asyncio.create_task(keepalive(msg))
    try:
        keywords, profile = await enrich_company(event)
    finally:
        hb.cancel()

    # 3. Ответ в Nest
    out = CompanyEnrichedEvent(
        company_id=event.company_id,
        keywords=keywords,
        profile_json=profile,
        enriched_at=datetime.now(timezone.utc),
    )
    await js.publish(
        subject_for_enriched(event.company_id),
        out.model_dump_json(by_alias=True).encode(),
        headers={"Nats-Msg-Id": f"{event.company_id}:enriched:{out.enriched_at.isoformat()}"},
    )

    # 4. Подтверждаем только после успешной публикации ответа
    await msg.ack()
    log.info("enriched published: %s keywords=%s", event.company_id, keywords)


async def enrich_loop(js) -> None:
    psub = await js.pull_subscribe(
        CompanyFilters.ENRICH,
        durable=CompanyConsumers.ML_ENRICH,
        stream=COMPANY_STREAM,
    )
    log.info("listening %s", CompanyFilters.ENRICH)

    while True:
        try:
            msgs = await psub.fetch(batch=5, timeout=5)
        except NatsTimeout:
            continue  # сообщений нет, это штатно

        for msg in msgs:
            try:
                await handle_enrich(js, msg)
            except Exception:
                log.exception("enrich failed, will retry in 30s")
                await msg.nak(delay=30)

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
    for company, res in zip(companies, results):
        if isinstance(res, _FATAL):
            raise res
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
            model=res.model,
            processed_at=datetime.now(timezone.utc),
        )
        await js.publish(
            subject_for_processed_news(company.company_id, news.id),
            out.model_dump_json(by_alias=True).encode(),
            headers={"Nats-Msg-Id": f"{news.id}:{company.company_id}"},
        )
        published += 1

    if failed:
        # не подтверждаем: сообщение вернётся. Повторные публикации безопасны,
        # потому что Nest делает upsert по паре (новость, компания)
        raise RuntimeError(f"{failed} scoring calls failed")

    await msg.ack()
    log.info("news %s: companies=%d matched=%d", news.id[:8], len(companies), published)

async def news_loop(js) -> None:
    psub = await js.pull_subscribe(
        NewsFilters.RAW, durable=NewsConsumers.ML_RAW, stream=NEWS_STREAM
    )
    log.info("listening %s", NewsFilters.RAW)

    while True:
        try:
            msgs = await psub.fetch(batch=5, timeout=5)
        except NatsTimeout:
            continue
        for msg in msgs:
            try:
                await handle_news(js, msg)
            except _FATAL as e:
                log.error("news fatal, message dropped: %s: %s", type(e).__name__, e)
                await msg.term()
            except Exception:
                log.exception("news failed, will retry in 30s")
                await msg.nak(delay=30)

async def ready_subscribe(js):
    async def on_ready(msg) -> None:
        try:
            registry.upsert(CompanyReadyEvent.model_validate_json(msg.data))
        except (ValidationError, ValueError) as e:
            log.warning("bad ready event on %s: %s", msg.subject, e)

    # Эфемерный push-консьюмер: на каждом старте получает последнее сообщение
    # по каждой компании (снимок), затем новые в реальном времени.
    sub = await js.subscribe(
        CompanyFilters.READY,
        stream=COMPANY_STREAM,
        cb=on_ready,
        manual_ack=True,  # ack_policy NONE: подтверждать нечего
        config=ConsumerConfig(
            deliver_policy=DeliverPolicy.LAST_PER_SUBJECT,
            ack_policy=AckPolicy.NONE,
        ),
    )
    log.info("subscribed %s (snapshot + live)", CompanyFilters.READY)
    return sub

async def main() -> None:
    nc = await nats.connect(settings.nats_url)
    js = nc.jetstream()
    log.info("connected to %s", settings.nats_url)
    try:
        await ready_subscribe(js)
        await asyncio.sleep(1)  # дать снимку компаний загрузиться до первых новостей
        await asyncio.gather(enrich_loop(js), news_loop(js))
    finally:
        await nc.drain()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass