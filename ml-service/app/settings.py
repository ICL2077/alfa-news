from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    nats_url: str = "nats://localhost:4222"


    llm_mode: str = "stub"  # stub | llm
    llm_base_url: str = "https://api.mistral.ai/v1"
    llm_api_key: str = ""
    llm_enrich_model: str = "mistral-large-latest"
    llm_timeout: float = 60
    llm_concurrency: int = 3
    llm_score_model: str = "openai/gpt-oss-20b"
    score_threshold: float = 0.5
    llm_min_interval: float = 0 
    prefilter_min_hits: int = 1
    news_text_limit: int = 2500  # символов новости, уходящих в LLM

settings = Settings()

if settings.llm_mode == "llm" and not settings.llm_api_key:
    raise RuntimeError("LLM_MODE=llm, но LLM_API_KEY не задан")