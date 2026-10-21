from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    nats_url: str = "nats://localhost:4222"

    # LLM
    llm_mode: str = "stub"  # stub | llm
    llm_base_url: str = "https://changellenge.up.railway.app/v1"
    llm_api_key: str = ""
    llm_enrich_model: str = "qwen/qwen3.6-35b-a3b"
    llm_score_model: str = "qwen/qwen3.6-35b-a3b"
    llm_chat_model: str = "qwen/qwen3.6-35b-a3b"
    llm_timeout: float = 90
    llm_concurrency: int = 2
    llm_min_interval: float = 0       # пауза между вызовами, сек
    llm_json_mode: bool = True
    llm_extra_body: str = ""          # JSON-строка, например {"reasoning":{"enabled":false}}
    llm_max_tokens: int = 2500
    llm_temperature: float = 0.2

    # Скоринг новостей
    score_threshold: float = 0.5
    prefilter_min_hits: int = 1
    news_text_limit: int = 2500

    # Чат
    chat_history_limit: int = 10
    chat_max_tokens: int = 1200


settings = Settings()

if settings.llm_mode == "llm" and not settings.llm_api_key:
    raise RuntimeError("LLM_MODE=llm, но LLM_API_KEY не задан")