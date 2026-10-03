"""Webs WordPress amb el connector "The Events Calendar" (API REST /wp-json/tribe/events/v1/events).

Genèric: serveix per a qualsevol web que el faci servir (p. ex. firescatalanes.cat). Les dates venen en
hora local de la web (camp `timezone`), sense zona; `all_day` indica si no hi ha hora.
"""

import html
from datetime import date, datetime

import httpx

from .. import http
from ..categories import classify
from ..geo import DEFAULT_ZONES, in_zones, locate_municipality
from ..models import Category, SourceEvent
from ..text import parse_price, strip_html
from .common import at, end_of, occurrence_days

PER_PAGE = 50
MAX_PAGES = 20


def api_url(site_url: str) -> str:
    from urllib.parse import urlsplit
    parts = urlsplit(site_url)
    return f"{parts.scheme}://{parts.netloc}/wp-json/tribe/events/v1/events"


def fetch(client: httpx.Client, site_url: str, today: date, until: date) -> list[dict]:
    events, url = [], api_url(site_url)
    params = {"per_page": PER_PAGE, "start_date": today.isoformat(), "end_date": until.isoformat()}
    for page in range(1, MAX_PAGES + 1):
        data = http.get(client, url, params={**params, "page": page}, timeout=60).json()
        events += data.get("events", [])
        if page >= int(data.get("total_pages") or 1):
            break
    return events


def parse_events(raw: list[dict], source: str, today: date, until: date, default_category: Category | None,
                 zones=DEFAULT_ZONES) -> list[SourceEvent]:
    out = []
    for e in raw:
        venue = e.get("venue") or {}
        if isinstance(venue, list):  # algunes webs retornen [] si no hi ha local
            venue = venue[0] if venue else {}
        lat, lon = venue.get("geo_lat"), venue.get("geo_lng")
        city = venue.get("city")
        if (lat is None or lon is None) and (place := locate_municipality(city)):
            city, lat, lon = place
        if lat is None or not in_zones(float(lat), float(lon), zones):
            continue
        title = html.unescape(e.get("title") or "").strip()
        if not title:
            continue
        start = datetime.fromisoformat(e["start_date"])
        end = datetime.fromisoformat(e["end_date"]) if e.get("end_date") else None
        all_day = bool(e.get("all_day"))
        categories = [html.unescape(c.get("name", "")) for c in e.get("categories") or []]
        category = classify(title, *categories, default=default_category) or "cultura"
        price_min, is_free, price_text = parse_price(html.unescape(e.get("cost") or ""))
        image = e.get("image") or {}
        common = dict(
            source=source, title=title, venue_name=html.unescape(venue.get("venue") or "") or None,
            address=venue.get("address") or None, city=city, lat=float(lat), lon=float(lon),
            price_min=price_min, is_free=is_free, price_text=price_text, url=e.get("url"),
            image_url=image.get("url") if isinstance(image, dict) else None, category=category,
            tags=[c.lower() for c in categories][:5],
            description=strip_html(e.get("excerpt") or e.get("description") or "")[:2000] or None,
        )
        days = occurrence_days(start.date(), end.date() if end else start.date(), today, until)
        multi = len(days) > 1
        for day, long_running in days:
            if long_running:
                out.append(SourceEvent(**common, external_id=f"{source}:{e['id']}", start=at(start.date(), None),
                                       end=end_of(end.date()) if end else None, all_day=True, kind="long_running"))
                continue
            same_day_times = not all_day and end and end.date() == start.date()
            out.append(SourceEvent(
                **common,
                external_id=f"{source}:{e['id']}" + (f":{day.isoformat()}" if multi else ""),
                start=at(day, None if all_day else start.time()),
                end=at(day, end.time()) if same_day_times else None,
                all_day=all_day, series_key=f"{source}:{e['id']}" if multi else None,
            ))
    return out
