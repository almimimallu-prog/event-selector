"""Eventbrite via l'API oficial (v3) amb un token personal (EVENTBRITE_TOKEN).

El web d'Eventbrite prohibeix la lectura automàtica (robots.txt i condicions d'ús), però l'API oficial
és la via permesa. No té cerca per zona (la van retirar el 2020): se segueixen organitzadors concrets.
  - Organitzador: https://www.eventbrite.es/o/nom-de-lorganitzador-12345678901
  - Esdeveniment: https://www.eventbrite.es/e/titol-123456789012  (se'n dedueix l'organitzador)
"""

import re
from datetime import date, datetime

import httpx

from ..categories import from_keywords
from ..geo import DEFAULT_ZONES, in_zones, locate_municipality
from ..models import Category, SourceEvent
from .common import at, end_of, occurrence_days

API = "https://www.eventbriteapi.com/v3"
MAX_PAGES = 10


class EventbriteError(Exception):
    pass


def parse_url(url: str) -> tuple[str, str] | None:
    """('organizer' | 'event', id) a partir d'un enllaç d'Eventbrite."""
    m = re.search(r"eventbrite\.[a-z.]+/(o|e)/[^?#]*?-?(\d{6,})/?(?:[?#].*)?$", url)
    if not m:
        return None
    return ("organizer" if m[1] == "o" else "event", m[2])


def _get(client: httpx.Client, token: str, path: str, **params) -> dict:
    response = client.get(f"{API}{path}", params=params, headers={"Authorization": f"Bearer {token}"}, timeout=60)
    if response.status_code in (401, 403):
        raise EventbriteError(f"Eventbrite {response.status_code}: token invàlid o sense permís ({path})")
    if response.status_code == 404:
        raise EventbriteError(f"Eventbrite 404: no existeix o no és públic ({path})")
    response.raise_for_status()
    return response.json()


def fetch_event(client: httpx.Client, token: str, event_id: str) -> dict:
    return _get(client, token, f"/events/{event_id}/", expand="venue,category")


def fetch_organizer(client: httpx.Client, token: str, organizer_id: str) -> list[dict]:
    events, continuation = [], None
    for _ in range(MAX_PAGES):
        params = {"status": "live", "order_by": "start_asc", "expand": "venue,category", "page_size": 50}
        if continuation:
            params["continuation"] = continuation
        data = _get(client, token, f"/organizers/{organizer_id}/events/", **params)
        events += data.get("events", [])
        page = data.get("pagination") or {}
        if not page.get("has_more_items"):
            break
        continuation = page.get("continuation")
    return events


def parse_events(raw: list[dict], today: date, until: date, default_category: Category,
                 zones=DEFAULT_ZONES) -> list[SourceEvent]:
    out = []
    for e in raw:
        if e.get("online_event") or e.get("status") in ("canceled", "draft"):
            continue
        venue = e.get("venue") or {}
        address = venue.get("address") or {}
        city = address.get("city")
        lat, lon = address.get("latitude") or venue.get("latitude"), address.get("longitude") or venue.get("longitude")
        if (lat is None or lon is None) and (place := locate_municipality(city)):
            city, lat, lon = place
        if lat is None or not in_zones(float(lat), float(lon), zones):
            continue
        title = ((e.get("name") or {}).get("text") or "").strip()
        if not title or not (e.get("start") or {}).get("local"):
            continue
        start = datetime.fromisoformat(e["start"]["local"])
        end = datetime.fromisoformat(e["end"]["local"]) if (e.get("end") or {}).get("local") else start
        category_name = (e.get("category") or {}).get("name") or ""
        common = dict(
            source="eventbrite", title=title, venue_name=venue.get("name"),
            address=address.get("localized_address_display") or address.get("address_1"), city=city,
            lat=float(lat), lon=float(lon), is_free=e.get("is_free"), price_min=0.0 if e.get("is_free") else None,
            url=e.get("url"), registration_url=e.get("url"),
            image_url=((e.get("logo") or {}).get("original") or {}).get("url") or (e.get("logo") or {}).get("url"),
            category=from_keywords(f"{title} {category_name}") or default_category,
            tags=[category_name.lower()] if category_name else [],
            description=((e.get("description") or {}).get("text") or e.get("summary") or "")[:2000] or None,
            summary_ca=None,
        )
        days = occurrence_days(start.date(), end.date(), today, until)
        for day, long_running in days:
            out.append(SourceEvent(
                **common,
                external_id=f"eventbrite:{e['id']}" + (f":{day.isoformat()}" if len(days) > 1 else ""),
                start=at(start.date(), None) if long_running else at(day, start.time()),
                end=end_of(end.date()) if long_running else (at(day, end.time()) if end.date() == start.date() else None),
                all_day=long_running,
                kind="long_running" if long_running else "session",
                series_key=f"eventbrite:{e['id']}" if len(days) > 1 else None,
            ))
    return out
