import asyncio
import logging

from . import rag

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
for n in ("httpx", "httpx2", "httpcore", "httpcore2", "openai"):
    logging.getLogger(n).setLevel(logging.WARNING)

QUERIES = [
    "ЦБ сохранил ключевую ставку на уровне 14%",
    "Рубль ослаб к юаню после решения ЦБ",
    "Инфляция в России ускорилась",
    "Цены на нефть упали",
    "Сборная выиграла матч отбора на чемпионат",  # контрольный запрос: ничего подходящего
]


async def main() -> None:
    await rag.init_rag()
    for q in QUERIES:
        print(f"\n{q}")
        for h in rag.debug_top(q):
            print(f"  {h.score:5.1f}  {h.chunk.source} стр.{h.chunk.page}: {h.chunk.text[:110]!r}")
        ctx = rag.bank_context(q)
        print(f"  -> в промпт попадёт: {len(ctx)} символов" + ("" if ctx else " (ниже порога RAG_MIN_SCORE)"))


asyncio.run(main())