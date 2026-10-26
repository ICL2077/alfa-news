# app/score_llm_attempt.py
import asyncio
import logging
import time
from datetime import datetime, timezone

from contract.company_contract import CompanyReadyEvent
from contract.news_contract import NewsRawEvent

from .llm import AnswerTruncated, BudgetExceeded
from .scoring import score_news
from .settings import settings
from .rag import init_rag

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logging.getLogger("scoring").setLevel(logging.DEBUG)
for name in ("httpx", "httpx2", "httpcore", "httpcore2", "openai"):
    logging.getLogger(name).setLevel(logging.WARNING)

NOW = datetime.now(timezone.utc)

# «Алюпак» привязан к U_141: опт бытовыми электротоварами, есть кредит, лизинг, депозиты,
# ключевой собственник. У самой компании нет «алюминия» в ОКВЭД, но демо-описание это
# компенсирует: новости про алюминий/металл ловятся через description/keywords, а реакция
# на ставку — через реальные bank-продукты.
COMPANY = CompanyReadyEvent(
    company_id="test",
    name="Алюпак",
    description="Производим алюминиевые банки для напитков, продаём пивоваренным и лимонадным заводам.",
    keywords=["алюминиевые банки", "цены на алюминий", "тарифы на металл", "спрос на пиво",
              "утилизация алюминиевых банок", "курс рубля", "налоги на упаковку"],
    bank_client_id="U_141",
    profile_json={
        "industry": "Производство алюминиевых упаковок",
        "customers": ["пивоваренные заводы", "лимонадные заводы"],
        "suppliers": ["металлургические компании"],
        "risks": ["рост цен на алюминий", "повышение пошлин на металл"],
    },
    updated_at=NOW,
)

# «СтройИнвест» привязан к U_9250: строительство инженерных сооружений, есть кредит,
# гарантии, лизинг, зарплатный проект, ВЭД КИТАЙ, ключевой собственник.
# sensitivities НЕ прописываем руками — derive добавит «ключевую ставку» и «ВЭД»
# из реальных bank-данных, а prefilter_terms заберёт ОКВЭД/регион/страны ФТС.
COMPANY_CREDIT = CompanyReadyEvent(
    company_id="t2",
    name="СтройИнвест",
    description="Девелопер жилья. Строительство финансируем проектными кредитами банков, "
                "около половины инвестиций за счёт заёмных средств. Часть покупателей берёт ипотеку. "
                "Работаем с металлоконструкциями и стройматериалами.",
    keywords=["ипотека", "жилищное строительство", "проектное финансирование",
              "кредиты застройщиков", "металлоконструкции", "пошлины на металл"],
    bank_client_id="U_9250",
    profile_json={
        "industry": "Жилищное строительство",
        "financing": "проектные кредиты банков, около половины инвестиций за счёт заёмных средств",
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
    news("n4", "ЦБ сохранил ключевую ставку на уровне 14%",
         "Совет директоров Банка России сохранил ключевую ставку, прервав цикл снижения."),
]


async def main() -> None:
    print(
        f"mode={settings.llm_mode}  model={settings.llm_score_model}\n"
        f"base_url={settings.llm_base_url}  threshold={settings.score_threshold}\n"
        f"extra_body={settings.llm_extra_body or '-'}"
    )

    await init_rag()

    for company in (COMPANY, COMPANY_CREDIT):
        print(f"\n===== {company.name} (bank_client_id={company.bank_client_id}) =====")
        for n in SAMPLES:
            started = time.monotonic()
            try:
                m = await score_news(n, company)
            except BudgetExceeded as e:
                print(f"\nДневной бюджет исчерпан: {e}")
                return
            except AnswerTruncated as e:
                print(f"\n{n.title}\n  -> ответ обрезан: {e}")
                continue

            print(f"\n{n.title}  ({time.monotonic() - started:.1f} c)")
            if m is None:
                print("  -> не подходит")
            else:
                print(f"  -> {m.score:.2f} [{m.category}] impact={m.impact} horizon={m.horizon}")
                print(f"     {m.explanation}")
                if m.actions:
                    print(f"     Действия: {'; '.join(m.actions)}")
                if m.alfa_view:
                    print(f"     Позиция банка: {m.alfa_view}")
                if m.sources:
                    print(f"     Источники: {m.sources}")


if __name__ == "__main__":
    asyncio.run(main())
