"""Agenda de la ciutat de Barcelona (Open Data BCN, dataset `agenda-cultural`, CSV diari).

Dataset: https://opendata-ajuntament.barcelona.cat/data/ca/dataset/agenda-cultural
Notes de les dades (2026-10):
  - CSV en UTF-16. Una fila per activitat (`register_id` únic).
  - `start_date`/`end_date` porten hores artificials (03:00, 12:00): només en fem servir la data.
  - L'horari real és una taula HTML a `timetable`: Dies | Hores | Preus | Observacions.
  - Molts tallers i cursos són setmanals ("Dijous", de l'1/10 al 10/12) → una sessió per setmana.
  - No hi ha categories: es dedueixen del títol.
"""

import csv
import io
import re
from datetime import date, datetime, timedelta

import httpx

from .. import http
from ..categories import from_keywords, is_exhibition
from ..config import TIMEZONE
from ..geo import DEFAULT_ZONES, in_zones
from ..models import SourceEvent
from ..text import is_excluded, parse_price, parse_times, parse_weekdays, strip_html

CSV_URL = (
    "https://opendata-ajuntament.barcelona.cat/data/dataset/2767159c-1c98-46b8-a686-2b25b40cb053"
    "/resource/3abb2414-1ee0-446e-9c25-380e938adb73/download"
)
MAX_DAILY_EXPANSION_DAYS = 6
REGISTRATION_ATTRS = {"Inscripcions", "Reserves", "Informació i reserves", "Venda d'entrades"}


def fetch(client: httpx.Client) -> list[dict]:
    response = http.get(client, CSV_URL, timeout=120)
    return parse_csv(response.content)


def parse_csv(content: bytes) -> list[dict]:
    text = content.decode("utf-16") if content[:2] in (b"\xff\xfe", b"\xfe\xff") else content.decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


# Classe CSS de cada cel·la → camp. Les cel·les amb rowspan s'arrosseguen a les files següents.
_TIMETABLE_FIELDS = {"timetable-day": "days", "timetable-hour": "hours", "timetable-price": "price",
                     "timetable-description": "notes"}
# Oberta 4 o més dies per setmana durant setmanes = horari d'obertura (exposició), no sessions.
OPENING_HOURS_MIN_WEEKDAYS = 4
# Sessions setmanals durant més d'aquests dies = curs (cal inscriure's a tot el curs).
COURSE_MIN_SPAN_DAYS = 21


def timetable_rows(value: str | None) -> list[dict[str, str]]:
    rows, carried = [], {}
    for tr in re.findall(r"<tr(?![^>]*timetable-header)[^>]*>(.*?)</tr>", value or "", re.S | re.I):
        row = {field: text for field, (text, left) in carried.items() if left > 0}
        carried = {field: (text, left - 1) for field, (text, left) in carried.items() if left > 1}
        for attrs, content in re.findall(r"<td([^>]*)>(.*?)</td>", tr, re.S | re.I):
            cls = re.search(r'class="([^"]+)"', attrs)
            field = _TIMETABLE_FIELDS.get(cls[1]) if cls else None
            if not field:
                continue
            span = re.search(r"rowspan=\"?(\d+)", attrs)
            row[field] = strip_html(content)
            if span and int(span[1]) > 1:
                carried[field] = (row[field], int(span[1]) - 1)
        if row:
            rows.append({f: row.get(f, "") for f in ("days", "hours", "price", "notes")})
    return rows


def _sessions(day0: date, day1: date, timetable: list[dict[str, str]], today: date, until: date):
    """[(dia, hora_inici, hora_fi, fila_horari)], una per dia. [] = tractar-ho com a llarga durada."""
    by_day = {}
    first, last = max(day0, today), min(day1, until)
    if (day1 - day0).days > MAX_DAILY_EXPANSION_DAYS:
        open_days = set().union(*(parse_weekdays(c["days"])[0] for c in timetable)) if timetable else set()
        if len(open_days) >= OPENING_HOURS_MIN_WEEKDAYS:
            return []
    for cells in timetable:
        weekdays, excluded = parse_weekdays(cells["days"])
        times = parse_times(cells["hours"]) or parse_times(cells["days"])
        start_t, end_t = times[0] if times else (None, None)
        if day0 == day1:
            if today <= day0 <= until:
                by_day.setdefault(day0, (day0, start_t, end_t, cells))
            continue
        long_span = (day1 - day0).days > MAX_DAILY_EXPANSION_DAYS
        if long_span and (not weekdays or len(weekdays) >= OPENING_HOURS_MIN_WEEKDAYS):
            return []
        weekdays = weekdays or set(range(7))
        day = first
        while day <= last:
            if day.weekday() in weekdays and not is_excluded(day, excluded):
                by_day.setdefault(day, (day, start_t, end_t, cells))  # grups A/B el mateix dia: el primer
            day += timedelta(days=1)
    return [by_day[d] for d in sorted(by_day)]


def _price(text: str | None):
    """Com parse_price, però sense la coletilla de subvencions dels cursos dels centres cívics."""
    if text:
        text = re.split(r"Reducció i subvenció|Cal inscripció|Places limitades", text)[0]
    return parse_price(text)


def _schedule_text(timetable: list[dict[str, str]], until: date | None = None) -> str | None:
    parts = []
    for cells in timetable:
        part = " ".join(p for p in (cells["days"], cells["hours"]) if p).strip()
        if part and part not in parts:
            parts.append(part)
    text = " · ".join(parts)
    if text and until:
        text += f" (fins al {until.day}/{until.month})"
    return text or None


def _links(row: dict) -> tuple[str | None, str | None]:
    value = (row.get("values_value") or "").strip()
    if not value.startswith("http"):
        return None, None
    is_registration = row.get("values_attribute_name") in REGISTRATION_ATTRS
    return (value if is_registration else None), value


def parse_rows(rows: list[dict], today: date, until: date, zones=DEFAULT_ZONES) -> list[SourceEvent]:
    events = []
    for row in rows:
        try:
            lat, lon = float(row["geo_epgs_4326_lat"]), float(row["geo_epgs_4326_lon"])
            day0 = date.fromisoformat(row["start_date"][:10])
            day1 = date.fromisoformat((row.get("end_date") or row["start_date"])[:10])
        except (KeyError, TypeError, ValueError):
            continue
        title = (row.get("name") or "").strip()
        if not title or day1 < today or day0 > until or not in_zones(lat, lon, zones):
            continue

        timetable = timetable_rows(row.get("timetable"))
        sessions = _sessions(day0, day1, timetable, today, until)
        long_running = not sessions and day1 > day0
        if is_exhibition(title) and day1 > day0:
            sessions, long_running = [], True
        # Curs: sessions setmanals durant setmanes. Una sola fitxa amb la propera sessió i l'horari.
        is_course = not long_running and (day1 - day0).days > COURSE_MIN_SPAN_DAYS
        if is_course:
            sessions = _sessions(day0, day1, timetable, today, day1)[:1]
            if not sessions:
                continue
        if not sessions and not long_running:
            if not today <= day0 <= until:
                continue
            sessions = [(day0, None, None, {"days": "", "hours": "", "price": "", "notes": ""})]

        category = from_keywords(title)
        registration_url, url = _links(row)
        road = " ".join(p for p in (row.get("addresses_road_name"), row.get("addresses_start_street_number")) if p)
        town = (row.get("addresses_town") or "").strip().title() or None
        base = dict(
            source="bcn",
            title=title,
            venue_name=(row.get("institution_name") or "").strip() or None,
            address=road or None,
            city=town,
            lat=lat,
            lon=lon,
            registration_url=registration_url,
            url=url,
            category=category or "cultura",
            category_guessed=category is None,
        )
        last_day_end = datetime.combine(day1, datetime.max.time().replace(microsecond=0), TIMEZONE)
        if long_running:
            price_min, is_free, price_text = _price(timetable[0]["price"] if timetable else None)
            events.append(SourceEvent(
                **base,
                external_id=f"bcn:{row['register_id']}",
                start=datetime.combine(day0, datetime.min.time(), TIMEZONE),
                end=last_day_end,
                all_day=True,
                kind="long_running",
                schedule_text=_schedule_text(timetable),
                price_min=price_min,
                is_free=is_free,
                price_text=price_text,
            ))
            continue

        # Sèrie segons les dates de tota l'activitat, no segons les sessions que cauen dins la finestra.
        multi = not is_course and (len(sessions) > 1 or (day1 - day0).days > MAX_DAILY_EXPANSION_DAYS)
        for day, start_t, end_t, cells in sessions:
            price_min, is_free, price_text = _price(cells["price"])
            notes = cells["notes"]
            tags = ["inscripció prèvia"] if re.search(r"inscripci", notes + cells["price"], re.I) else []
            if start_t:
                start = datetime.combine(day, start_t, TIMEZONE)
                end = datetime.combine(day, end_t, TIMEZONE) if end_t else None
                if end and end < start:
                    end += timedelta(days=1)
            else:
                start, end = datetime.combine(day, datetime.min.time(), TIMEZONE), None
            events.append(SourceEvent(
                **base,
                external_id=f"bcn:{row['register_id']}" + (f":{day.isoformat()}" if multi else ""),
                start=start,
                # Curs: `start` és la propera sessió i `end`, l'últim dia del curs.
                end=last_day_end if is_course else end,
                all_day=start_t is None,
                kind="course" if is_course else "session",
                schedule_text=_schedule_text(timetable, until=day1) if is_course else None,
                price_min=price_min,
                is_free=is_free,
                price_text=price_text,
                tags=tags,
                description=notes or None,
                series_key=f"bcn:{row['register_id']}" if multi else None,
            ))
    return events
