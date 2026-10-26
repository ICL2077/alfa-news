# Зеркало contract/company.contract.ts
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

# ============================================================
# NATS: stream, subjects, consumer names
# ============================================================

COMPANY_STREAM = "COMPANY"  # именно так назван стрим в Nest


class CompanyConsumers:
    ML_ENRICH = "company_enrich"          # durable, создаёт Nest, читает Python
    NEST_ENRICHED = "company_enriched"    # durable, создаёт и читает Nest
    # company.ready Python читает ЭФЕМЕРНОЙ подпиской (durable не нужен)


class CompanyFilters:
    ENRICH = "company.enrich.>"
    ENRICHED = "company.enriched.>"
    READY = "company.ready.>"


def subject_for_enrich(company_id: str) -> str:
    return f"company.enrich.{company_id}"


def subject_for_enriched(company_id: str) -> str:
    return f"company.enriched.{company_id}"


def subject_for_ready(company_id: str) -> str:
    return f"company.ready.{company_id}"


# ============================================================
# Events
# ============================================================

class _Event(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class CompanyEnrichEvent(_Event):
    """Запрос на обогащение. Nest -> Python (company.enrich.<companyId>)."""

    company_id: str = Field(..., alias="companyId")
    name: str
    description: Optional[str] = None
    inn: Optional[str] = None
    region: Optional[str] = None
    bank_client_id: Optional[str] = Field(None, alias="bankClientId")


class CompanyEnrichedEvent(_Event):
    """Результат обогащения. Python -> Nest (company.enriched.<companyId>)."""

    company_id: str = Field(..., alias="companyId")
    keywords: list[str]
    profile_json: dict[str, Any] = Field(..., alias="profileJson")  # объект, не строка
    enriched_at: datetime = Field(..., alias="enrichedAt")

    bank_client_id: Optional[str] = Field(None, alias="bankClientId")


class CompanyReadyEvent(_Event):
    """Компания готова принимать новости. Nest -> Python (company.ready.<companyId>)."""

    company_id: str = Field(..., alias="companyId")
    name: str
    description: Optional[str] = None
    region: Optional[str] = None
    keywords: list[str] = []
    profile_json: Optional[dict[str, Any]] = Field(None, alias="profileJson")
    updated_at: datetime = Field(..., alias="updatedAt")

    bank_client_id: Optional[str] = Field(None, alias="bankClientId")