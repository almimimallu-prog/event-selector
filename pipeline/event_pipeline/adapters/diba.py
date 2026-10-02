"""Agendes de la Diputació de Barcelona (API de dades obertes): turisme i museus locals.

Dataset (machinename): `actesturisme_ca`, `actesmuseus`. https://dadesobertes.diba.cat
Notes de les dades (2026-10): dates sense hora (00:00 → 23:59), `localitzacio` "lat,lon",
categories a `tags` ("Visites guiades", "Natura", "Gastronomia"...).
"""

from datetime import date, datetime

import httpx

from .. import http
from ..categories import from_keywords
from ..geo import DEFAULT_ZONES, in_zones
from ..models import Category, SourceEvent
from ..text import parse_price, parse_times, strip_html
from .common import at, end_of, occurrence_days

API = "https://do.diba.cat/api/dataset/{dataset}/format/json/pag-ini/1/pag-fi/5000/camp-data_fi-greaterequal/{today}"


def fetch(client: httpx.Client, dataset: str, today: date) -> list[dict]:
    data = http.get(client, API.format(dataset=dataset, today=today.isoformat()), timeout=120).json()
    return data.get("elements", [])


def parse_events(raw: list[dict], source: str, today: date, until: date, default_category: Category,
                 zones=DEFAULT_ZONES) -> list[SourceEvent]:
    out = []
    for e in raw:
        address = e.get("grup_adreca") or {}
        try:
            lat, lon = (float(x) for x in (address.get("localitzacio") or "").split(","))
        except ValueError:
            continue
        if not in_zones(lat, lon, zones) or not e.get("titol"):
            continue
        day0 = datetime.fromisoformat(e["data_inici"]).date()
        day1 = datetime.fromisoformat(e["data_fi"]).date() if e.get("data_fi") else day0
        times = parse_times(e.get("observacions_horari"))
        tags = [t for t in (e.get("tags") or []) if not t.startswith("000")]
        title = e["titol"].strip()
        price_min, is_free, price_text = parse_price(e.get("preu"))
        common = dict(
            source=source, title=title, venue_name=address.get("adreca_nom") or None,
            address=address.get("adreca") or None, city=address.get("municipi_nom") or None, lat=lat, lon=lon,
            price_min=price_min, is_free=is_free, price_text=price_text,
            registration_url=e.get("url_inscripcions") or None, url=e.get("acte_url") or e.get("url_general"),
            image_url=(e.get("imatge") or [None])[0],
            category=from_keywords(" ".join([title, *tags, *(e.get("tipus") or [])])) or default_category,
            tags=[t.lower() for t in tags if t != address.get("municipi_nom")][:5],
            description=strip_html(e.get("descripcio"))[:2000] or None,
        )
        days = occurrence_days(day0, day1, today, until)
        for day, long_running in days:
            out.append(SourceEvent(
                **common,
                external_id=f"{source}:{e['acte_id']}" + (f":{day.isoformat()}" if len(days) > 1 else ""),
                start=at(day0 if long_running else day, None if long_running or not times else times[0][0]),
                end=end_of(day1) if long_running and day1 else None,
                all_day=long_running or not times,
                kind="long_running" if long_running else "session",
                series_key=f"{source}:{e['acte_id']}" if len(days) > 1 else None,
            ))
    return out
