import re
from dataclasses import dataclass

from contract.company_contract import CompanyReadyEvent
from contract.news_contract import NewsRawEvent


@dataclass
class Match:
    score: float
    summary: str
    explanation: str


def _stems(words: list[str]) -> set[str]:
    # основа в 5 символов грубо переживает падежи: "ставка", "ставки" -> "став"
    return {w.lower()[:5] for w in words if len(w) >= 4}


def score_news(news: NewsRawEvent, company: CompanyReadyEvent) -> Match | None:
    text = f"{news.title} {news.description or ''} {news.full_text or ''}".lower()
    tokens = {t[:5] for t in re.findall(r"[a-zа-яё]{4,}", text)}

    hits = sorted(_stems(company.keywords) & tokens)
    if not hits:
        return None

    return Match(
        score=min(1.0, 0.3 + 0.2 * len(hits)),
        summary=news.title,
        explanation=f"Совпадение по ключевым словам компании: {', '.join(hits)}",
    )