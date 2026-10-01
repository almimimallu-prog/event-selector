"""Configuració del pipeline a partir de variables d'entorn (.env en local, Secrets a GitHub Actions)."""

import os
from dataclasses import dataclass
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

TIMEZONE = ZoneInfo("Europe/Madrid")


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_service_role_key: str
    gemini_api_key: str
    groq_api_key: str | None


def load_settings() -> Settings:
    load_dotenv()
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY") if not os.getenv(k)]
    if missing:
        raise RuntimeError(f"Falten variables d'entorn: {', '.join(missing)} (vegeu .env.example)")
    return Settings(
        supabase_url=os.environ["SUPABASE_URL"],
        supabase_service_role_key=os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        gemini_api_key=os.environ["GEMINI_API_KEY"],
        groq_api_key=os.getenv("GROQ_API_KEY") or None,
    )
