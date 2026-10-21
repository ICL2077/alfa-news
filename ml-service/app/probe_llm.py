import asyncio
import sys

from openai import AsyncOpenAI

from .settings import settings

VARIANTS: dict[str, dict | None] = {
    "без параметров": None,
    "reasoning.enabled=false": {"reasoning": {"enabled": False}},
    "reasoning.effort=low": {"reasoning": {"effort": "low"}},
    "enable_thinking=false": {"chat_template_kwargs": {"enable_thinking": False}},
}


async def main() -> None:
    model = sys.argv[1] if len(sys.argv) > 1 else settings.llm_enrich_model
    client = AsyncOpenAI(
        base_url=settings.llm_base_url, api_key=settings.llm_api_key, max_retries=0
    )
    print(f"model={model}\n")

    for name, extra in VARIANTS.items():
        kwargs: dict = dict(
            model=model,
            messages=[{"role": "user", "content": 'Верни JSON {"ok": true} и ничего больше.'}],
            max_tokens=300,
            temperature=0,
        )
        if extra:
            kwargs["extra_body"] = extra
        try:
            r = await client.chat.completions.create(**kwargs)
        except Exception as e:  # noqa: BLE001
            print(f"{name:28} ОШИБКА {type(e).__name__}: {str(e)[:120]}")
            continue

        msg = r.choices[0].message
        details = getattr(r.usage, "completion_tokens_details", None)
        reasoning = getattr(details, "reasoning_tokens", None) if details else None
        has_reasoning = bool(getattr(msg, "reasoning", None) or getattr(msg, "reasoning_content", None))
        print(
            f"{name:28} completion={r.usage.completion_tokens:4} "
            f"reasoning_tokens={reasoning} reasoning_field={has_reasoning} "
            f"finish={r.choices[0].finish_reason} content={(msg.content or '')[:40]!r}"
        )


asyncio.run(main())