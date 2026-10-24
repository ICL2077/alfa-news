import asyncio
import hashlib
import json
import logging
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import fitz  # PyMuPDF
from rank_bm25 import BM25Okapi

from .llm import BudgetExceeded, ask_vision
from .settings import settings

log = logging.getLogger("rag")

BASE = Path(__file__).resolve().parent.parent  # корень ml-service, не зависит от места запуска
MIN_TEXT_LAYER = 150  # меньше символов на странице: считаем её сканом и отправляем в OCR

OCR_PROMPT = (
    "Это страница аналитического отчёта банка. Перепиши весь текст страницы дословно "
    "на языке оригинала, сохраняя абзацы. Таблицы передай строками, ячейки через « | ». "
    "Для графиков укажи заголовок, подписи осей и видимые значения. "
    "Не добавляй пояснений и комментариев. Если на странице нет текста, ответь одним словом: ПУСТО."
)

_WORD = re.compile(r"[a-zа-яё0-9]{3,}")


@dataclass(frozen=True)
class Chunk:
    source: str
    page: int
    text: str


@dataclass(frozen=True)
class Hit:
    chunk: Chunk
    score: float


_chunks: list[Chunk] = []
_bm25: BM25Okapi | None = None


def _path(p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else BASE / path


def _tokens(text: str) -> list[str]:
    # основа в 4 символа: "нефть"/"нефти" и "рубль"/"рубля" сходятся
    return [w[:4] for w in _WORD.findall(text.lower().replace("ё", "е"))]

def debug_top(query: str, n: int = 3) -> list[Hit]:
    """Лучшие фрагменты без порога: для настройки RAG_MIN_SCORE."""
    if _bm25 is None:
        return []
    scores = _bm25.get_scores(_tokens(query))
    order = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:n]
    return [Hit(_chunks[i], float(scores[i])) for i in order]


# ---------------- OCR ----------------

_easy_reader = None


def _easyocr(png: bytes) -> str:
    global _easy_reader
    if _easy_reader is None:
        import easyocr  # тяжёлая зависимость, импортируем только при использовании

        _easy_reader = easyocr.Reader(["ru", "en"], verbose=False)
    return "\n".join(_easy_reader.readtext(png, detail=0, paragraph=True))


async def _ocr_page(page) -> str:
    png = page.get_pixmap(dpi=settings.ocr_dpi).tobytes("png")
    if settings.ocr_backend == "easyocr":
        return await asyncio.to_thread(_easyocr, png)  # не блокируем цикл событий
    text = await ask_vision(png, OCR_PROMPT, settings.llm_ocr_model, settings.ocr_max_tokens)
    return "" if text.strip().upper() == "ПУСТО" else text


async def _extract_pdf(pdf: Path) -> tuple[dict[str, str], bool]:
    """Тексты страниц {номер: текст} и признак, что обработаны все страницы."""
    sha = hashlib.sha256(pdf.read_bytes()).hexdigest()
    cache_dir = _path(settings.rag_cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f"{pdf.stem}.json"

    pages: dict[str, str] = {}
    if cache_file.exists():
        cached = json.loads(cache_file.read_text(encoding="utf-8"))
        # кэш действителен, пока не изменился файл и способ распознавания
        if cached.get("sha") == sha and cached.get("backend") == settings.ocr_backend:
            pages = cached.get("pages", {})

    def save() -> None:
        tmp = cache_file.with_suffix(".tmp")
        payload = {"sha": sha, "backend": settings.ocr_backend, "pages": pages}
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp.replace(cache_file)

    complete = True
    ocr_calls = 0
    doc = fitz.open(pdf)
    try:
        total = doc.page_count
        for i, page in enumerate(doc, start=1):
            if str(i) in pages:
                continue

            text = page.get_text().strip()  # сначала текстовый слой, он бесплатный
            if len(text) < MIN_TEXT_LAYER:
                try:
                    text = await _ocr_page(page)
                    ocr_calls += 1
                except BudgetExceeded:
                    log.error("%s: бюджет LLM исчерпан на стр. %d, остальное после сброса", pdf.name, i)
                    complete = False
                    break
                except Exception:
                    log.exception("%s: OCR стр. %d не удался, пропускаю", pdf.name, i)
                    continue

            pages[str(i)] = text
            save()  # сохраняем после каждой страницы: сбой или бюджет не сожгут уже сделанное
    finally:
        doc.close()

    log.info("%s: страниц=%d, с текстом=%d, вызовов OCR=%d", pdf.name, total, len(pages), ocr_calls)
    return pages, complete


# ---------------- индекс ----------------

def _split(source: str, page: int, text: str) -> list[Chunk]:
    size, overlap = settings.rag_chunk_size, 150
    text = re.sub(r"[ \t]+", " ", text).strip()
    out: list[Chunk] = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            # не режем слово: ищем ближайший разделитель слева
            cut = max(text.rfind("\n", start, end), text.rfind(". ", start, end), text.rfind(" ", start, end))
            if cut > start + size // 2:
                end = cut + 1
        piece = text[start:end].strip()
        if len(piece) >= 80:
            out.append(Chunk(source, page, piece))
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return out


async def init_rag() -> None:
    """Читает кэш (при необходимости делает OCR) и строит индекс BM25."""
    global _chunks, _bm25

    if not settings.rag_enabled:
        log.info("RAG отключён (RAG_ENABLED=false)")
        return

    pdfs = sorted(_path(settings.rag_dir).glob("*.pdf"))
    if not pdfs:
        log.warning("RAG: PDF не найдены в %s, аналитика банка не подключена", settings.rag_dir)
        return

    chunks: list[Chunk] = []
    for pdf in pdfs:
        pages, complete = await _extract_pdf(pdf)
        for num, text in sorted(pages.items(), key=lambda kv: int(kv[0])):
            chunks.extend(_split(pdf.stem, int(num), text))
        if not complete:
            log.warning("RAG: индекс неполный, часть страниц не распознана")
            break

    tokenized = [_tokens(c.text) for c in chunks]
    if not any(tokenized):
        log.warning("RAG: после обработки нет текста для индекса")
        return

    _chunks = chunks
    _bm25 = BM25Okapi(tokenized)
    _retrieve.cache_clear()
    log.info("RAG готов: файлов=%d, фрагментов=%d", len(pdfs), len(chunks))


# ---------------- поиск ----------------

@dataclass(frozen=True)
class Retrieval:
    ready: bool                  # индекс загружен
    hits: tuple[Hit, ...]        # фрагменты, попавшие в промпт
    best_score: float            # лучший балл (даже если он ниже порога)
    context: str                 # текст для промпта


@lru_cache(maxsize=512)
def _retrieve(query: str) -> Retrieval:
    if _bm25 is None:
        return Retrieval(False, (), 0.0, "")

    top = debug_top(query, settings.rag_top_k)
    best = top[0].score if top else 0.0
    if not top or best < settings.rag_min_score:
        return Retrieval(True, (), best, "")  # слабое совпадение: лучше без контекста, чем с шумом

    used: list[Hit] = []
    parts: list[str] = []
    total = 0
    for h in top:
        if h.score < 0.6 * best:
            continue
        block = f"[{h.chunk.source}, стр. {h.chunk.page}]\n{h.chunk.text}"
        if total + len(block) > settings.rag_max_chars:
            break
        used.append(h)
        parts.append(block)
        total += len(block)
    return Retrieval(True, tuple(used), best, "\n\n".join(parts))


def retrieve(query: str) -> Retrieval:
    return _retrieve(query[:800])


def bank_context(query: str) -> str:
    return retrieve(query).context