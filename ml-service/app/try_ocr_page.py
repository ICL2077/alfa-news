import asyncio
import logging
import sys

import fitz

from . import rag
from .settings import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
for n in ("httpx", "httpx2", "httpcore", "httpcore2", "openai"):
    logging.getLogger(n).setLevel(logging.WARNING)


async def main() -> None:
    pdfs = sorted(rag._path(settings.rag_dir).glob("*.pdf"))
    if not pdfs:
        print(f"PDF не найдены в {settings.rag_dir}")
        return

    idx = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    page_no = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    pdf = pdfs[idx]

    doc = fitz.open(pdf)
    print(f"файл: {pdf.name}, страниц: {doc.page_count}, берём стр. {page_no}, backend={settings.ocr_backend}")
    text = await rag._ocr_page(doc[page_no - 1])
    print(f"\n--- распознано символов: {len(text)} ---\n{text}")


asyncio.run(main())