"""Configuración central — todas las variables de entorno viven aquí."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE = Path(__file__).resolve().parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # Opcionales: solo se requieren cuando se usan sus endpoints.
    OPENAI_API_KEY: str = ""
    ELEVENLABS_API_KEY: str = ""
    N8N_WEBHOOK_URL: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    ELEVENLABS_STT_MODEL: str = "scribe_v1"
    STT_LANGUAGE: str = "es"
    APP_VERSION: str = "v2"

    # SaaS / auth
    AUTH_DISABLED: bool = False
    SUPABASE_JWT_SECRET: str = ""
    DEFAULT_TEAM_ID: str = ""
    CORS_ORIGINS: str = "*"  # comma-separated
    RATE_LIMIT_PER_MINUTE: int = 60
    MAX_UPLOAD_BYTES: int = 25_000_000  # 25MB
    N8N_WEBHOOK_SECRET: str = ""
    ENVIRONMENT: str = "development"  # development|staging|production

    # Stripe (optional — billing stubs return 501 when empty)
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_STARTER: str = ""
    STRIPE_PRICE_PRO: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
