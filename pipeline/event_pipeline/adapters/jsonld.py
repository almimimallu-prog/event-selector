"""Pàgines amb esdeveniments schema.org en JSON-LD (genèric; p. ex. dev.events).

Els esdeveniments en línia (eventAttendanceMode Online) es descarten: l'app és de plans presencials.
Una hora 00:00 exacta es tracta com "sense hora" (moltes webs només publiquen el dia).
"""

from datetime import date, datetime

import httpx

from .. import http
from ..categories import from_keywords
from ..clean import json_ld_events
from ..config import TIMEZONE
from ..geo import DEFAULT_ZONES, in_zones, locate_municipality
from ..models import Category, SourceEvent
from ..text import parse_price, strip_html
from .common import at, end_of, occurrence_days, slug


def fetch(client: httpx.Client, url: str) -> list[dict]:
    return json_ld_events(http.get(client, url, timeout=60).text)


def _first(value):
    return value[0] if isinstance(value, list) and value else value


def _location(event: dict) -> tuple[str | None, str | None, float | None, float | None]:
    place = _first(event.get("location")) or {}
    if not isinstance(place, dict):
        return None, None, None, None
    address = place.get("address") or {}
    city = address.get("addressLocality") if isinstance(address, dict) else None
    geo = place.get("geo") or {}
    lat, lon = geo.get("latitude"), geo.get("longitude")
    if (lat is None or lon is None) and (found := locate_municipality(city)):
        city, lat, lon = found
    return place.get("name"), city, (float(lat) if lat is not None else None), (float(lon) if lon is not None else None)


def parse_events(raw: list[dict], source: str, today: date, until: date, default_category: Category | None,
                 zones=DEFAULT_ZONES) -> list[SourceEvent]:
    out, seen = [], set()
    for e in raw:
        if "Online" in str(e.get("eventAttendanceMode", "")) or not e.get("startDate") or not e.get("name"):
            continue
        venue, city, lat, lon = _location(e)
        if lat is None or not in_zones(lat, lon, zones):
            continue
        start = datetime.fromisoformat(e["startDate"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(e["endDate"].replace("Z", "+00:00")) if e.get("endDate") else None
        all_day = len(e["startDate"]) <= 10 or start.strftime("%H:%M:%S") == "00:00:00"
        offer = _first(e.get("offers")) or {}
        price = offer.get("price") if isinstance(offer, dict) else None
        price_min, is_free, price_text = parse_price(f"{price} €" if price not in (None, "") else None)
        title = e["name"].strip()
        common = dict(
            source=source, title=title, venue_name=venue, city=city, lat=lat, lon=lon,
            price_min=price_min, is_free=is_free, price_text=price_text, url=e.get("url"),
            image_url=_first(e.get("image")) if isinstance(_first(e.get("image")), str) else None,
            category=from_keywords(title) or default_category or "cultura",
            description=strip_html(e.get("description"))[:2000] or None,
        )
        key = f"{source}:{slug(e.get('url') or title)}"
        if key in seen:  # la mateixa pàgina pot repetir un esdeveniment en dues llistes
            continue
        seen.add(key)
        local_start = start if all_day else start.astimezone(TIMEZONE)
        # Sense data de fi = acaba el mateix dia (no és "permanent").
        days = occurrence_days(local_start.date(), end.date() if end else local_start.date(), today, until)
        for day, long_running in days:
            out.append(SourceEvent(
                **common,
                external_id=key + (f":{day.isoformat()}" if len(days) > 1 else ""),
                start=at(day, None if all_day or long_running else local_start.time()),
                end=end_of(end.date()) if long_running and end else None,
                all_day=all_day or long_running,
                kind="long_running" if long_running else "session",
                series_key=key if len(days) > 1 else None,
            ))
    return out
