"""Fonts llavor (públiques) i conversió d'esdeveniments al format que espera `ingest_events`.

Només hi van fonts obertes i públiques. Les fonts personals (perfils, canals, newsletters) s'afegeixen
des de l'app i viuen a Supabase, mai al repositori.
"""

import hashlib
import json
import re
from datetime import datetime

from . import EXTRACTOR_VERSION
from .adapters import bcn, diba, gencat
from .geo import locate_municipality
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
        "config": {"adapter": "llm"},
        "schedule_hours": 24,
        "default_city": "Igualada",
        "discovered_via": "seed",
    },
    # Igualada i l'Anoia (afegides el 2026-10-02). Cap no té dades estructurades → Gemini.
    {
        "name": "Tiquets Igualada",  # venda d'entrades municipal: Teatre Municipal l'Ateneu, curses...
        "type": "web",
        "url": "https://tiquetsigualada.cat/",
        "config": {"adapter": "llm"},
        "schedule_hours": 24,
        "default_city": "Igualada",
        "discovered_via": "seed",
    },
    {
        "name": "Teatre de l'Aurora",
        "type": "web",
        "url": "https://www.teatreaurora.cat/ca/programacio.html",
        "config": {"adapter": "llm"},
        "schedule_hours": 48,
        "default_city": "Igualada",
        "discovered_via": "seed",
    },
    {
        "name": "Ateneu Igualadí",
        "type": "web",
        "url": "https://www.ateneuigualadi.cat/",
        "config": {"adapter": "llm"},
        "schedule_hours": 48,
        "default_city": "Igualada",
        "discovered_via": "seed",
    },
    {
        "name": "Anoia Diari (agenda)",
        "type": "web",
        "url": "https://anoiadiari.cat/agenda/",
        "config": {"adapter": "llm"},
        "schedule_hours": 24,
        "discovered_via": "seed",
    },
    # Afegides el 2026-10-02 (aprovades per l'usuari). Eventbrite descartat: robots.txt ho prohibeix.
    {
        "name": "Diputació de Barcelona: Turisme",
        "type": "api",
        "url": diba.API.format(dataset="actesturisme_ca", today="").rsplit("/", 1)[0],
        "config": {"adapter": "diba", "dataset": "actesturisme_ca", "default_category": "cultura"},
        "schedule_hours": 24,
        "discovered_via": "search",
    },
    {
        "name": "Diputació de Barcelona: Museus",
        "type": "api",
        "url": diba.API.format(dataset="actesmuseus", today="").rsplit("/", 1)[0],
        "config": {"adapter": "diba", "dataset": "actesmuseus", "default_category": "cultura"},
        "schedule_hours": 24,
        "discovered_via": "search",
    },
    {
        "name": "Fires Catalanes",
        "type": "api",
        "url": "https://firescatalanes.cat/",
        "config": {"adapter": "tribe", "default_category": "gastronomia_social"},
        "schedule_hours": 24,
        "discovered_via": "search",
    },
    {
        # La pàgina de meetups retorna els mateixos esdeveniments: n'hi ha prou amb aquesta.
        "name": "dev.events: tecnologia a Barcelona",
        "type": "web",
        "url": "https://dev.events/EU/ES/Barcelona/tech",
        "config": {"adapter": "jsonld", "default_category": "formacio_tech"},
        "schedule_hours": 48,
        "default_city": "Barcelona",
        "discovered_via": "search",
    },
    {
        "name": "Consell Esportiu de l'Anoia",
        "type": "web",
        "url": "https://www.ceanoia.cat/",
        "config": {"adapter": "llm"},
        "schedule_hours": 48,
        "default_city": "Igualada",
        "discovered_via": "search",
    },
    {
        "name": "Tech Barcelona (agenda)",
        "type": "web",
        "url": "https://www.techbarcelona.com/agenda/",
        "config": {"adapter": "llm"},
        "schedule_hours": 48,
        "default_city": "Barcelona",
        "discovered_via": "search",
    },
    {
        "name": "La Veu de l'Anoia (agenda)",
        "type": "web",
        "url": "https://veuanoia.cat/el-calendari-de-lanoia/",
        "config": {"adapter": "llm"},
        "schedule_hours": 24,
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
            "tags", "description", "summary_ca", "series_key")},
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
    # Ubicació aproximada pel municipi (fins que hi hagi geocodificació de locals).
    place = locate_municipality(event.city or source.get("default_city"))
    city = place[0] if place else (event.city or source.get("default_city"))
    if city and "sense lloc" in problems:  # el municipi de la font ja situa l'esdeveniment
        problems = [p for p in problems if p != "sense lloc"]
    return {
        # Amb l'hora: el mateix espectacle pot fer dues sessions el mateix dia (18:00 i 20:00).
        "external_id": f"{_slug(event.title)}:{event.start.date().isoformat()}"
                       + ("" if event.all_day else f"T{event.start:%H%M}"),
        "title": event.title,
        "start": _iso(event.start),
        "end": _iso(event.end),
        "all_day": event.all_day,
        "kind": event.kind,
        "venue_name": event.venue_name,
        "address": event.address,
        "city": city,
        "lat": place[1] if place else None,
        "lon": place[2] if place else None,
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
