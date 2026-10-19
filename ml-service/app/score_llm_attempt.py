import asyncio
import logging
from datetime import datetime, timezone

from contract.company_contract import CompanyReadyEvent
from contract.news_contract import NewsRawEvent

from .scoring import score_news

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
logging.getLogger("scoring").setLevel(logging.DEBUG)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("openai").setLevel(logging.WARNING)

NOW = datetime.now(timezone.utc)

COMPANY = CompanyReadyEvent(
    company_id="test",
    name="Алюпак",
    description="Производим алюминиевые банки для напитков, продаём пивоваренным и лимонадным заводам.",
    keywords=["алюминиевые банки", "цены на алюминий", "тарифы на металл", "спрос на пиво",
              "утилизация алюминиевых банок", "курс рубля", "налоги на упаковку"],
    profile_json={
        "industry": "Производство алюминиевых упаковок",
        "customers": ["пивоваренные заводы", "лимонадные заводы"],
        "suppliers": ["металлургические компании"],
        "risks": ["рост цен на алюминий", "повышение пошлин на металл"],
    },
    updated_at=NOW,
)


def news(i: str, title: str, text: str) -> NewsRawEvent:
    return NewsRawEvent(id=i, guid=i, title=title, description=text, link="https://x",
                        pub_date=NOW, published_at=NOW)


SAMPLES = [
    news("n1", "Цены на алюминий выросли до максимума за два года",
         "Биржевые цены на алюминий выросли на 12% из-за сокращения поставок."),
    news("n2", "Минфин обсуждает повышение пошлин на импорт металлов",
         "Рассматривается увеличение ввозных пошлин на прокат цветных металлов."),
    news("n3", "Сборная выиграла матч отбора на чемпионат",
         "Матч закончился со счётом 2:1, курс билетов вырос."),
    news("n4", "ЦБ сохранил ключевую ставку",
         "Курс рубля к доллару практически не изменился после заседания."),
]


async def main() -> None:
    for n in SAMPLES:
        m = await score_news(n, COMPANY)
        print("\n" + n.title)
        print("  ->", "не подходит" if m is None else f"{m.score:.2f} [{m.category}] {m.explanation}")


asyncio.run(main())