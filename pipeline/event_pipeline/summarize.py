"""Explicació curta ("què és?") per als esdeveniments que no en tenen.

Molts títols no s'entenen sols ("Göteborg", "Mal de closca"). Les fonts estructurades (Generalitat,
Barcelona) sovint no porten resum: aquí se'n demana un a Gemini per lots, només per als esdeveniments
propers sense `summary_ca`. Si no hi ha prou informació, l'LLM retorna null i es marca com a "sense resum"
(cadena buida) per no tornar-ho a demanar.
"""

import json
from datetime import datetime, timedelta

import httpx
from pydantic import BaseModel, ValidationError

from . import gemini
from .store import Store

BATCH = 25
MAX_PER_RUN = 300
HORIZON_DAYS = 30

SYSTEM = """You write one short explanatory line in Catalan for each event of a personal event calendar.
The line answers "what is this?" for someone who only sees the title.

Rules:
- Max 120 characters, one sentence, Catalan, neutral tone (no marketing, no exclamation marks).
- Say what kind of activity it is and the key detail: e.g. "Comèdia teatral de Jordi Casanovas sobre una
  parella que imagina vides alternatives", "Concert de jazz manouche", "Taller infantil de ciència".
- Do NOT repeat the date, time, price or place, and do not just repeat the title.
- Ignore company names alone and review quotes ("Estimulant i lírica"): explain the activity itself.
- Use only the given information. If it is not enough to know what it is, return null. Never invent."""


class Summary(BaseModel):
    id: str
    summary_ca: str | None


class SummaryBatch(BaseModel):
    items: list[Summary]


def _describe(event: dict) -> dict:
    return {
        "id": event["id"],
        "title": event["title"],
        "category": event["category"],
        "tags": event.get("tags") or [],
        "venue": (event.get("venues") or {}).get("name"),
        "description": (event.get("description") or "")[:600] or None,
    }


def pending(store: Store, now: datetime, limit: int = MAX_PER_RUN) -> list[dict]:
    until = (now + timedelta(days=HORIZON_DAYS)).isoformat()
    return store.select(
        "events",
        select="id,title,category,tags,description,venues(name)",
        summary_ca="is.null",
        kind="in.(session,long_running)",
        status="eq.published",
        start_at=f"lt.{until}",
        **{"or": f"(start_at.gte.{now.isoformat()},end_at.gte.{now.isoformat()})"},
        order="start_at",
        limit=str(limit),
    )


def summarize_batch(client: httpx.Client, api_key: str, events: list[dict]) -> tuple[dict[str, str], gemini.Usage]:
    prompt = "EVENTS (JSON):\n" + json.dumps([_describe(e) for e in events], ensure_ascii=False)
    text, usage = gemini.generate_json(client, api_key, system=SYSTEM, prompt=prompt,
                                       schema=SummaryBatch.model_json_schema())
    try:
        batch = SummaryBatch.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise gemini.GeminiError(f"Resum invàlid: {exc}") from exc
    known = {e["id"] for e in events}
    # "" = l'LLM no ha sabut què és: es desa igualment perquè no es torni a demanar.
    return {s.id: (s.summary_ca or "").strip()[:200] for s in batch.items if s.id in known}, usage


def run(client: httpx.Client, store: Store, api_key: str, now: datetime, record_usage) -> int:
    events = pending(store, now)
    done = 0
    for start in range(0, len(events), BATCH):
        batch = events[start:start + BATCH]
        summaries, usage = summarize_batch(client, api_key, batch)
        record_usage(store, usage)
        for event_id, summary in summaries.items():
            store.update("events", {"summary_ca": summary}, id=f"eq.{event_id}")
        done += len(summaries)
    return done
