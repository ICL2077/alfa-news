from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    nats_url: str = "nats://localhost:4222"

    # LLM
    llm_mode: Literal["stub", "llm"] = "stub"  # stub | llm
    llm_base_url: str = "https://changellenge.up.railway.app/v1"
    llm_api_key: str = ""
    llm_enrich_model: str = "qwen/qwen3.6-35b-a3b"
    llm_score_model: str = "qwen/qwen3.6-35b-a3b"
    llm_chat_model: str = "qwen/qwen3.6-35b-a3b"
    llm_timeout: float = 180
    llm_concurrency: int = 2
    llm_min_interval: float = 0
    llm_json_mode: bool = True
    llm_extra_body: str = ""
    llm_max_tokens: int = 2500
    llm_temperature: float = 0.2

    score_threshold: float = 0.5
    prefilter_min_hits: int = 1
    news_text_limit: int = 2500

    chat_history_limit: int = 10
    chat_max_tokens: int = 1200
    chat_article_limit: int = 4000

    rag_enabled: bool = True
    rag_dir: str = "data/alfa_pdfs"
    rag_cache_dir: str = "data/alfa_cache"
    ocr_backend: Literal["vlm", "easyocr"] = "vlm"
    llm_ocr_model: str = "qwen/qwen3-vl-30b-a3b-instruct"
    ocr_dpi: int = 150
    ocr_concurrency: int = Field(2, ge=1, le=4)
    ocr_max_tokens: int = 3000
    rag_top_k: int = 3
    rag_max_chars: int = 2400
    rag_chunk_size: int = 900
    rag_min_score: float = 6.0

    # Данные банка (CSV)
    bank_csv_dir: str = "data/csv"
    bank_cache_dir: str = "data/bank_cache"
    bank_uid_file: str = "df_Uid_data_hack.csv"
    bank_payment_file: str = "df_Uid_payment_hack.csv"
    bank_link_file: str = "df_Fid_Uid_link_hack.csv"
    bank_csv_sep: str = ";"
    bank_revenue_unit: float = 1.0
    bank_links_enabled: bool = True
    bank_payments_enabled: bool = True

settings = Settings()

if settings.llm_mode == "llm" and not settings.llm_api_key:
    raise RuntimeError("LLM_MODE=llm, но LLM_API_KEY не задан")