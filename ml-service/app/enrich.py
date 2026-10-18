import re

from contract.company_contract import CompanyEnrichEvent


async def enrich_company(event: CompanyEnrichEvent) -> tuple[list[str], dict]:
    """Возвращает (keywords, profile_json). Пока без LLM."""
    text = f"{event.name} {event.description or ''}".lower()
    keywords = sorted(set(re.findall(r"[a-zа-яё]{4,}", text)))[:10]

    profile = {
        "industry": "stub",
        "products": [],
        "suppliers": [],
        "competitors": [],
        "regions": [event.region] if event.region else [],
        "risks": [],
    }
    return keywords, profile