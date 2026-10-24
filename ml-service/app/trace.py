import time
from contextlib import contextmanager
from typing import Any, Iterator

from contract.agent_contract import AgentStep, AgentTrace


class _Step:
    def __init__(self) -> None:
        self.detail: dict[str, Any] = {}
        self.status = "ok"

    def skip(self, reason: str) -> None:
        self.status = "skipped"
        self.detail["reason"] = reason


class Trace:
    """Собирает шаги, которые реально выполнил код. Ключи detail в camelCase (это JSON-контракт)."""

    def __init__(self) -> None:
        self._t0 = time.monotonic()
        self.steps: list[AgentStep] = []

    @contextmanager
    def step(self, type_: str, title: str) -> Iterator[_Step]:
        s = _Step()
        started = time.monotonic()
        try:
            yield s
        except Exception as e:
            s.status = "error"
            s.detail["error"] = type(e).__name__
            raise
        finally:
            self.steps.append(
                AgentStep(
                    seq=len(self.steps) + 1,
                    type=type_,
                    title=title,
                    status=s.status,
                    duration_ms=round((time.monotonic() - started) * 1000),
                    detail=s.detail,
                )
            )

    def build(self) -> AgentTrace:
        return AgentTrace(
            steps=self.steps,
            duration_ms=round((time.monotonic() - self._t0) * 1000),
        )