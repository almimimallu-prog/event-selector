"""Fonts llavor (públiques) i conversió d'esdeveniments al format que espera `ingest_events`.

Només hi van fonts obertes i públiques. Les fonts personals (perfils, canals, newsletters) s'afegeixen
des de l'app i viuen a Supabase, mai al repositori.
"""

import hashlib
import json
import re
from datetime import datetime

from . import EXTRACTOR_VERSION
from .adapters import bcn, gencat
from .models import ExtractedEvent, SourceEvent

SEED_SOURCES = [
    {
        "name": "Agenda Cultural de Catalunya",
        "type": "api",
        "url": gencat.API_URL,
        "config": {"adapter": "gencat"},
        "schedule_hours": 12,
        "is_complete_listing": True,
        "discovered_via": "seed",
    },
    {
        "name": "Agenda de Barcelona (Open Data BCN)",
        "type": "api",
        "url": bcn.CSV_URL,
        "config": {"adapter": "bcn"},
        "schedule_hours": 24,
        "default_city": "Barcelona",
        "is_complete_listing": True,
        "discovered_via": "seed",
    },
    {
        "name": "Igualada Turisme",
        "type": "web",
        "url": "https://igualadaturisme.com/agenda-propers-esdeveniments/",
        "config": {"adapter": "llm", "default_lat": 41.5789, "default_lon": 1.6175},
        "schedule_hours": 24,
        "default_city": "Igualada",
        "discovered_via": "seed",
    },
]


def content_hash(data: dict) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def item_from_source_event(event: SourceEvent) -> dict:
    payload = event.model_dump(mode="json")
    return {
        **{k: payload[k] for k in (
            "external_id", "title", "all_day", "kind", "schedule_text", "venue_name", "address", "city", "lat",
            "lon", "price_min", "is_free", "price_text", "registration_url", "url", "image_url", "category",
            "tags", "description", "series_key")},
        "start": _iso(event.start),
        "end": _iso(event.end),
        "content_hash": content_hash(payload),
        "payload": payload,
        "status": "published",
        "confidence": 1.0,
        "extractor_version": f"adapter:{event.source}",
    }


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60]


def item_from_extracted(event: ExtractedEvent, source: dict, now: datetime) -> dict | None:
    """None si no s'ha de guardar (no és un esdeveniment o ja ha passat)."""
    problems = event.problems(now)
    if "no és un esdeveniment" in problems or "ja ha passat" in problems:
        return None
    payload = event.model_dump(mode="json")
    config = source.get("config") or {}
    city = event.city or source.get("default_city")
    same_city = city and source.get("default_city") and city.lower() == source["default_city"].lower()
    return {
        "external_id": f"{_slug(event.title)}:{event.start.date().isoformat()}",
        "title": event.title,
        "start": _iso(event.start),
        "end": _iso(event.end),
        "all_day": event.all_day,
        "kind": event.kind,
        "venue_name": event.venue_name,
        "address": event.address,
        "city": city,
        # Fins que hi hagi geocodificació, el centre de la ciutat per defecte de la font.
        "lat": config.get("default_lat") if same_city else None,
        "lon": config.get("default_lon") if same_city else None,
        "price_min": event.price_min,
        "is_free": event.is_free,
        "price_text": event.price_text,
        "registration_url": event.registration_url,
        "url": event.detail_url or source.get("url"),
        "image_url": event.image_url,
        "category": event.category,
        "tags": event.tags,
        "summary_ca": event.summary_ca,
        "content_hash": content_hash(payload),
        "payload": payload,
        "status": "review" if problems else "published",
        "review_reasons": problems,
        "confidence": event.confidence,
        "extractor_version": EXTRACTOR_VERSION,
    }
