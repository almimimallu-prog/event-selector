"""Calendaris iCalendar (.ics): grups de Meetup i qualsevol web que publiqui un calendari per subscriure-s'hi.

Meetup va tancar la seva API (només per a Meetup Pro), però cada grup ofereix el seu calendari a
https://www.meetup.com/<grup>/events/ical/, pensat perquè t'hi subscriguis des d'un calendari personal;
el robots.txt de Meetup no el restringeix (sí els feeds atom/rss/xml).
"""

import re
from datetime import date, datetime, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

from .. import http
from ..categories import classify
from ..config import TIMEZONE
from ..geo import DEFAULT_ZONES, in_zones, locate_municipality
from ..models import Category, SourceEvent
from ..text import parse_price, strip_html
from .common import at, end_of, occurrence_days, slug


def meetup_ical_url(url: str) -> str | None:
    """Enllaç d'un grup (o d'un esdeveniment) de Meetup → calendari iCal del grup."""
    m = re.search(r"meetup\.com/(?:[a-z]{2}(?:-[A-Z]{2})?/)?([A-Za-z0-9_-]+)", url)
    if not m or m[1] in ("find", "topics", "cities", "login", "register", "apps", "pro", "blog", "lp", "help"):
        return None
    return f"https://www.meetup.com/{m[1]}/events/ical/"


def fetch(client: httpx.Client, url: str) -> str:
    return http.get(client, url, timeout=60).text


def _unfold(text: str) -> list[str]:
    """RFC 5545: les línies llargues continuen a la següent si comença amb espai o tabulació."""
    lines: list[str] = []
    for raw in text.replace("\r\n", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


def _unescape(value: str) -> str:
    return re.sub(r"\\([\\;,nN])", lambda m: "\n" if m[1] in "nN" else m[1], value).strip()


def parse_calendar(text: str) -> list[dict]:
    """Llista de VEVENT com a {PROPIETAT: (valor, {paràmetres})}."""
    events, current = [], None
    for line in _unfold(text):
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT" and current is not None:
            events.append(current)
            current = None
        elif current is not None and ":" in line:
            head, value = line.split(":", 1)
            name, *params = head.split(";")
            current.setdefault(name.upper(), (value, dict(p.split("=", 1) for p in params if "=" in p)))
    return events


def _when(prop: tuple[str, dict] | None) -> tuple[datetime | None, bool]:
    """(moment local, és_tot_el_dia)."""
    if not prop:
        return None, False
    value, params = prop
    if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", value):
        return datetime.combine(date(int(value[:4]), int(value[4:6]), int(value[6:8])), time(0), TIMEZONE), True
    dt = datetime.strptime(value.rstrip("Z")[:15], "%Y%m%dT%H%M%S")
    if value.endswith("Z"):
        return dt.replace(tzinfo=ZoneInfo("UTC")).astimezone(TIMEZONE), False
    try:
        tz = ZoneInfo(params["TZID"]) if "TZID" in params else TIMEZONE
    except ZoneInfoNotFoundError:
        tz = TIMEZONE
    return dt.replace(tzinfo=tz).astimezone(TIMEZONE), False


def _place(location: str | None, geo: str | None, default_city: str | None):
    """(local, adreça, municipi, lat, lon) a partir de LOCATION / GEO."""
    lat = lon = None
    if geo and ";" in geo:
        try:
            lat, lon = (float(x) for x in geo.split(";")[:2])
        except ValueError:
            lat = lon = None
    venue = address = city = None
    if location:
        parts = [p.strip() for p in re.split(r"[,()]", location) if p.strip()]
        venue = parts[0] if parts else None
        address = location
        for part in reversed(parts):  # el municipi sol anar al final ("Sala X, C/ Major 3, 08700 Igualada")
            if found := locate_municipality(re.sub(r"^\d{5}\s*", "", part)):
                city = found[0]
                if lat is None:
                    lat, lon = found[1], found[2]
                break
    if city is None and default_city and (found := locate_municipality(default_city)):
        city = found[0]
        if lat is None:
            lat, lon = found[1], found[2]
    return venue, address, city, lat, lon


def is_online(location: str | None) -> bool:
    return bool(location) and bool(re.search(r"\bonline\b|en l[ií]nia|virtual|https?://", location, re.I))


# Meetup no posa LOCATION als calendaris: l'activitat s'assigna al municipi per defecte de la font. Els grups
# internacionals (Toastmasters, networking...) hi barregen sessions en línia o d'altres ciutats: es descarten pel títol.
_ONLINE_TITLE = re.compile(r"\bonline\b|en l[ií]ne[ao]|en l[ií]nia|\bzoom\b|\bwebinar\b", re.I)
_ELSEWHERE = re.compile(r"\b(lisboa|lisbon|ericeira|alg[ée]s|lagoas park|porto|portugal|madrid|val[eè]ncia|mijas|m[áa]laga|"
                        r"sevilla|seville|vigo|bilbao|zaragoza|granada|tenerife|mallorca|ibiza|london|paris)\b", re.I)


def parse_events(text: str, source: str, today: date, until: date, default_category: Category | None,
                 default_city: str | None = None, zones=DEFAULT_ZONES) -> list[SourceEvent]:
    out = []
    for e in parse_calendar(text):
        title = _unescape(e.get("SUMMARY", ("", {}))[0])
        start, all_day = _when(e.get("DTSTART"))
        if not title or start is None or e.get("STATUS", ("", {}))[0].upper() == "CANCELLED":
            continue
        if _ONLINE_TITLE.search(title) or _ELSEWHERE.search(title):
            continue
        end, _ = _when(e.get("DTEND"))
        location = _unescape(e["LOCATION"][0]) if "LOCATION" in e else None
        if is_online(location):
            continue
        venue, address, city, lat, lon = _place(location, e.get("GEO", (None, {}))[0], default_city)
        if lat is not None and not in_zones(lat, lon, zones):
            continue
        description = strip_html(_unescape(e["DESCRIPTION"][0]))[:2000] if "DESCRIPTION" in e else None
        price_min, is_free, price_text = parse_price(None)
        uid = e.get("UID", (None, {}))[0]
        key = f"{source}:{slug(uid or title + start.date().isoformat())}"
        if all_day and end is not None:  # DTEND d'un dia sencer és exclusiu
            end = datetime.fromordinal(end.toordinal() - 1).replace(tzinfo=TIMEZONE)
        common = dict(
            source=source, title=title, venue_name=venue, address=address, city=city, lat=lat, lon=lon,
            price_min=price_min, is_free=is_free, price_text=price_text,
            url=_unescape(e["URL"][0]) if "URL" in e else None,
            category=classify(title, description, default=default_category) or "cultura",
            description=description or None,
        )
        days = occurrence_days(start.date(), (end or start).date(), today, until)
        for day, long_running in days:
            out.append(SourceEvent(
                **common,
                external_id=key + (f":{day.isoformat()}" if len(days) > 1 else ""),
                start=at(day, None if all_day or long_running else start.time()),
                end=(end_of(end.date()) if long_running and end else
                     None if all_day or long_running or end is None or len(days) > 1 else end),
                all_day=all_day or long_running,
                kind="long_running" if long_running else "session",
                series_key=key if len(days) > 1 else None,
            ))
    return out
