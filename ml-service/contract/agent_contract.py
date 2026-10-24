from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class _Model(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class AgentStep(_Model):
    seq: int
    type: str
    title: str
    status: str = "ok"  # ok | skipped | error
    duration_ms: int = Field(0, alias="durationMs")
    detail: dict[str, Any] = Field(default_factory=dict)


class AgentTrace(_Model):
    steps: list[AgentStep] = Field(default_factory=list)
    duration_ms: int = Field(0, alias="durationMs")