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


@lru_cache
def get_settings() -> Settings:
    return Settings()
