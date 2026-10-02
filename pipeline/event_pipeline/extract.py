"""Extracció amb LLM (pas 6): text, imatge o PDF → ExtractionResult validat."""

import json
from dataclasses import dataclass
from datetime import datetime

import httpx
from pydantic import ValidationError

from . import gemini
from .config import TIMEZONE
from .models import ExtractionResult

SYSTEM = """You extract real-world events from Catalan/Spanish/English web pages, social posts and posters
for a personal event calendar around Igualada and Barcelona (Catalonia).

Rules:
- Extract ONLY events explicitly present in the content. Never invent dates, times, places or prices.
- One item per event. If the same event is listed for several explicit dates, emit one item per date.
- Dates: resolve relative expressions ("aquest dissabte", "demà") using TODAY. If the year is missing,
  use the next occurrence on or after TODAY. Output ISO 8601 local time (Europe/Madrid), no offset.
- If the time is unknown, set all_day=true and start at 00:00. Never guess a time.
- kind: "session" = specific day(s), including festivals of a few days (use end for the last day);
  "long_running" = exhibitions or activities open for weeks/months; "course" = weekly classes for weeks
  that require enrolment for the whole course.
- category: cultura (concerts, theatre, cinema, exhibitions, guided cultural visits, literature),
  esport_natura (hiking, cycling, races, sport, nature outings), formacio_tech (talks, workshops,
  courses, conferences, technology), gastronomia_social (markets, fairs, food, popular festivals, social).
- price_min: lowest price in euros; is_free=true only if explicitly free.
- detail_url / image_url: copy the URLs from the markdown links/images belonging to that event, if any.
- summary_ca: max 2 short lines in Catalan, factual, no marketing tone.
- tags: up to 5 short lowercase Catalan tags (e.g. "infantil", "música", "visita guiada").
- is_event=false for items that are not attendable events (news, ads, generic opening hours).
- confidence: 0-1, how sure you are that date, place and title are correct.
- If there are no events, return {"events": []}."""


@dataclass
class SourceContext:
    """Dades per defecte de la font: ajuden l'LLM quan el contingut no diu on és."""
    name: str
    url: str | None = None
    default_city: str | None = None
    default_venue: str | None = None


def _schema() -> dict:
    return ExtractionResult.model_json_schema()


def build_prompt(content: str, source: SourceContext, now: datetime) -> str:
    lines = [
        f"TODAY: {now.astimezone(TIMEZONE):%Y-%m-%d (%A) %H:%M} Europe/Madrid",
        f"SOURCE: {source.name}" + (f" — {source.url}" if source.url else ""),
    ]
    if source.default_city:
        lines.append(f"DEFAULT CITY (if the content does not say otherwise): {source.default_city}")
    if source.default_venue:
        lines.append(f"DEFAULT VENUE (if the content does not say otherwise): {source.default_venue}")
    lines += ["", "CONTENT:", content]
    return "\n".join(lines)


def extract(
    client: httpx.Client,
    api_key: str,
    content: str,
    source: SourceContext,
    now: datetime,
    attachments: tuple[gemini.Attachment, ...] = (),
) -> tuple[ExtractionResult, gemini.Usage]:
    text, usage = gemini.generate_json(
        client, api_key, system=SYSTEM, prompt=build_prompt(content, source, now),
        schema=_schema(), attachments=attachments,
    )
    try:
        return ExtractionResult.model_validate(json.loads(text)), usage
    except (json.JSONDecodeError, ValidationError) as exc:
        # Si un sol esdeveniment és invàlid, salvem la resta.
        try:
            raw = json.loads(text).get("events", [])
        except (json.JSONDecodeError, AttributeError):
            raise gemini.GeminiError(f"JSON invàlid: {exc}") from exc
        valid = []
        for item in raw:
            try:
                valid.append(ExtractionResult.model_validate({"events": [item]}).events[0])
            except ValidationError:
                continue
        return ExtractionResult(events=valid), usage
