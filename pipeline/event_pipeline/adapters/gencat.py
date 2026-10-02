"""Agenda Cultural de Catalunya (dades obertes de la Generalitat, API Socrata).

Dataset: https://analisi.transparenciacatalunya.cat/d/rhpv-yr4f
Notes de les dades (2026-10):
  - `georefer_ncia` gairebé sempre és buit → es filtra per `latitud`/`longitud`.
  - `data_inici`/`data_fi` són dates sense hora; l'hora va en text lliure a `horari`.
  - Activitats permanents porten la data 9999-09-09.
  - Les imatges són camins relatius a agenda.cultura.gencat.cat.
"""

import re
from datetime import date, datetime, timedelta
from urllib.parse import quote

import httpx

from .. import http
from ..categories import from_gencat_tags, from_keywords, gencat_tag_names
from ..config import TIMEZONE
from ..geo import DEFAULT_ZONES, bounding_box, in_zones
from ..models import SourceEvent
from ..text import WEEKDAYS, parse_duration_minutes, parse_price, parse_times

API_URL = "https://analisi.transparenciacatalunya.cat/resource/rhpv-yr4f.json"
IMAGE_BASE = "https://agenda.cultura.gencat.cat"
# Activitats de més dies que això sense sessions clares → "llarga durada" (exposicions, cicles).
MAX_DAILY_EXPANSION_DAYS = 6

FIELDS = [
    "codi", "denominaci", "subt_tol", "descripcio", "data_inici", "data_fi", "horari", "gratuita",
    "entrades", "linkbotoentrades", "url", "enllac1_url", "permanent", "imatges", "imgapp", "adre_a",
    "espai", "localitat", "municipi", "latitud", "longitud", "tags_categor_es", "tags_mbits",
]


def fetch(client: httpx.Client, today: date, until: date, zones=DEFAULT_ZONES) -> list[dict]:
    lat_min, lat_max, lon_min, lon_max = bounding_box(zones)
    where = (
        f"latitud between {lat_min:.4f} and {lat_max:.4f} "
        f"AND longitud between {lon_min:.4f} and {lon_max:.4f} "
        f"AND data_fi >= '{today.isoformat()}' AND data_inici <= '{until.isoformat()}'"
    )
    params = {"$select": ",".join(FIELDS), "$where": where, "$order": "codi", "$limit": "10000"}
    response = http.get(client, API_URL, params=params, timeout=60)
    return response.json()


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40]


def _city(row: dict) -> str | None:
    if row.get("localitat"):
        return row["localitat"]
    slug = (row.get("municipi") or "").rsplit("/", 1)[-1]
    return slug.replace("-", " ").title().replace(" De ", " de ").replace(" Del ", " del ") or None


def _image(row: dict) -> str | None:
    path = row.get("imgapp") or (row.get("imatges") or "").split(",")[0].strip()
    return IMAGE_BASE + quote(path) if path.startswith("/") else (path or None)


def _occurrences(day0: date, day1: date | None, horari: str, today: date, until: date):
    """Retorna [(dia, és_llarga_durada)]."""
    if day1 is None or day1 < day0:
        return [(day0, True)]
    span = (day1 - day0).days
    if span == 0:
        return [(day0, False)] if today <= day0 <= until else []
    mentions_weekdays = any(w in horari.lower() for w in WEEKDAYS)
    if span <= MAX_DAILY_EXPANSION_DAYS and parse_times(horari) and not mentions_weekdays:
        days = (day0 + timedelta(days=i) for i in range(span + 1))
        return [(d, False) for d in days if today <= d <= until]
    return [(day0, True)]


def parse_rows(rows: list[dict], today: date, until: date, zones=DEFAULT_ZONES) -> list[SourceEvent]:
    events = []
    for row in rows:
        try:
            lat, lon = float(row["latitud"]), float(row["longitud"])
        except (KeyError, TypeError, ValueError):
            continue
        if not in_zones(lat, lon, zones) or not row.get("denominaci"):
            continue
        day0 = date.fromisoformat(row["data_inici"][:10])
        raw_end = row.get("data_fi", "")[:10]
        day1 = None if raw_end.startswith("9999") or row.get("permanent") == "Sí" else date.fromisoformat(raw_end)
        horari = row.get("horari") or ""
        times = parse_times(horari)
        duration = parse_duration_minutes(horari)

        if row.get("gratuita") == "Sí":
            price_min, is_free, price_text = 0.0, True, "Gratuït"
        else:
            price_min, is_free, price_text = parse_price(row.get("entrades"))

        tags = gencat_tag_names(row.get("tags_categor_es"), row.get("tags_mbits"))
        title = row["denominaci"].strip()
        category = (
            from_gencat_tags(row.get("tags_categor_es"))
            or from_keywords(title)
            or from_gencat_tags(row.get("tags_mbits"))
            or "cultura"  # és una agenda cultural: per defecte, cultura
        )
        occurrences = _occurrences(day0, day1, horari, today, until)
        # Un mateix codi pot tenir una fila per local (festivals en diverses sales): el local forma part de l'id.
        place = _slug(row.get("espai") or f"{lat:.4f},{lon:.4f}")
        for day, long_running in occurrences:
            if long_running:
                start = datetime.combine(day0, datetime.min.time(), TIMEZONE)
                end = datetime.combine(day1, datetime.max.time().replace(microsecond=0), TIMEZONE) if day1 else None
                all_day = True
            elif times:
                first, last = times[0]
                start = datetime.combine(day, first, TIMEZONE)
                if last:
                    end = datetime.combine(day, last, TIMEZONE)
                    end = end if end >= start else end + timedelta(days=1)
                else:
                    end = start + timedelta(minutes=duration) if duration else None
                all_day = False
            else:
                start, end, all_day = datetime.combine(day, datetime.min.time(), TIMEZONE), None, True
            multi = len(occurrences) > 1
            events.append(SourceEvent(
                source="gencat",
                external_id=f"gencat:{row['codi']}:{place}" + (f":{day.isoformat()}" if multi else ""),
                title=title,
                start=start,
                end=end,
                all_day=all_day,
                kind="long_running" if long_running else "session",
                schedule_text=(horari.strip() or None) if long_running else None,
                venue_name=row.get("espai") or None,
                address=row.get("adre_a") or None,
                city=_city(row),
                lat=lat,
                lon=lon,
                price_min=price_min,
                is_free=is_free,
                price_text=price_text,
                registration_url=row.get("linkbotoentrades") or None,
                url=row.get("linkbotoentrades") or row.get("url") or row.get("enllac1_url") or None,
                image_url=_image(row),
                category=category,
                tags=tags,
                description=(row.get("descripcio") or "").strip()[:2000] or None,
                series_key=f"gencat:{row['codi']}:{place}" if multi else None,
            ))
    return events
