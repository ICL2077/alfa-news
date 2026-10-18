import logging

from contract.company_contract import CompanyReadyEvent

log = logging.getLogger("registry")


class CompanyRegistry:
    """Компании, готовые принимать новости. Живёт в памяти процесса."""

    def __init__(self) -> None:
        self._items: dict[str, CompanyReadyEvent] = {}

    def upsert(self, company: CompanyReadyEvent) -> None:
        is_new = company.company_id not in self._items
        self._items[company.company_id] = company
        log.info(
            "company %s: %s (%d keywords), total=%d",
            "added" if is_new else "updated",
            company.name,
            len(company.keywords),
            len(self._items),
        )

    def all(self) -> list[CompanyReadyEvent]:
        return list(self._items.values())

    def __len__(self) -> int:
        return len(self._items)


registry = CompanyRegistry()