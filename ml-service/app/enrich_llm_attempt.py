import asyncio
import json
import logging
import time

from contract.company_contract import CompanyEnrichEvent

from .enrich import enrich_company
from .llm import BudgetExceeded
from .settings import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
# шум HTTP-библиотек скрываем, строки llm и scoring оставляем
for name in ("httpx", "httpx2", "httpcore", "httpcore2", "openai"):
    logging.getLogger(name).setLevel(logging.WARNING)


async def main() -> None:
    print(
        f"mode={settings.llm_mode}  model={settings.llm_enrich_model}\n"
        f"base_url={settings.llm_base_url}  key set: {bool(settings.llm_api_key)}"
    )

    event = CompanyEnrichEvent(
        companyId="test",
        name="Алюпак",
        description=(
            "Производим алюминиевые банки для напитков, продаём пивоваренным и "
            "лимонадным заводам в России и Казахстане. Сырьё закупаем у металлургов. "
            "Часть оборудования закупается в кредит."
        ),
    )

    started = time.monotonic()
    try:
        keywords, profile = await enrich_company(event)
    except BudgetExceeded as e:
        print(f"\nДневной бюджет исчерпан: {e}")
        return
    elapsed = time.monotonic() - started

    print(f"\nГотово за {elapsed:.1f} c, ключевых слов: {len(keywords)}\n")
    print(json.dumps({"keywords": keywords, "profile": profile}, ensure_ascii=False, indent=2))


asyncio.run(main())