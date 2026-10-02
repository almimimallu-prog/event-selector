"""Lectura de textos d'agenda en català: hores, durades, preus i dies de la setmana.

Els formats reals vistos a les fonts (2026-10):
  hores   "18 h", "17.30 h", "a les 18.00 h", "de 17.00 h a 19.00 h", "d'11.00 h a 13.00 h", "de 10 a 14 h"
  durada  "Durada aproximada: 55 minuts", "1 hora i 30 minuts", "1 h 30 min"
  preu    "Preu: 22 €", "Entrada Gratuïta", "Entrada general: 125.91 €", "Entrada general de: 10 a 15 €"
  dies    "Dijous", "Dimarts i dijous", "De dilluns a divendres", "Cada dia", "Dilluns excepte 12 octubre i 7 desembre"
"""

import html
import re
from datetime import date, time

WEEKDAYS = ["dilluns", "dimarts", "dimecres", "dijous", "divendres", "dissabte", "diumenge"]
MONTHS = ["gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre", "octubre", "novembre", "desembre"]

_HM = r"(\d{1,2})(?:[.:](\d{2}))?"
_RANGE = re.compile(rf"\bd(?:e\s+|')\s*{_HM}\s*h?\s+a\s+(?:les\s+)?{_HM}\s*h\b", re.I)
_SINGLE = re.compile(rf"(?<![\d.:]){_HM}\s*h\b", re.I)
_DURATION = re.compile(r"durada[^:]*:\s*(.*)", re.I | re.S)


def strip_html(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<(br|/p|/div|/tr)\b[^>]*>", "\n", value, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text)).replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\s*\n\s*", "\n", text).strip()


def _to_time(h: str, m: str | None) -> time | None:
    hour, minute = int(h), int(m or 0)
    if hour == 24 and minute == 0:
        return time(23, 59)
    if hour > 23 or minute > 59:
        return None
    return time(hour, minute)


def parse_times(text: str | None) -> list[tuple[time, time | None]]:
    """Franges horàries en ordre d'aparició. Ignora la part de "Durada" (no són hores del dia)."""
    if not text:
        return []
    text = _DURATION.split(text)[0]
    ranges = []
    for m in _RANGE.finditer(text):
        start, end = _to_time(m[1], m[2]), _to_time(m[3], m[4])
        if start:
            ranges.append((start, end))
    if ranges:
        return ranges
    singles = []
    for m in _SINGLE.finditer(text):
        start = _to_time(m[1], m[2])
        if start:
            singles.append((start, None))
    return singles


def parse_duration_minutes(text: str | None) -> int | None:
    if not text:
        return None
    m = _DURATION.search(text)
    if not m:
        return None
    part = m[1][:60].lower()
    hours = re.search(r"(\d+)\s*(?:hores|hora|h)\b", part)
    minutes = re.search(r"(\d+)\s*(?:minuts|minut|min)\b", part)
    total = (int(hours[1]) * 60 if hours else 0) + (int(minutes[1]) if minutes else 0)
    return total or None


def parse_price(text: str | None) -> tuple[float | None, bool | None, str | None]:
    """(preu mínim, és gratuït, text original resumit)."""
    if not text or not text.strip():
        return None, None, None
    clean = re.sub(r"\s+", " ", text).strip()
    lower = clean.lower()
    amounts = [float(a.replace(",", ".")) for a in re.findall(r"(\d+(?:[.,]\d{1,2})?)\s*(?=€|euros?\b)", lower)]
    amounts += [float(a.replace(",", ".")) for a in re.findall(r"\bde:?\s*(\d+(?:[.,]\d{1,2})?)\s+a\s+\d", lower)]
    free = bool(re.search(r"gratu[iï]t|gratis|entrada lliure|accés lliure|entrada libre", lower))
    if amounts:
        low = min(amounts)
        return low, low == 0, clean[:80]
    if free:
        return 0.0, True, clean[:80]
    if "taquilla inversa" in lower:
        return None, None, "Taquilla inversa"
    return None, None, clean[:80]


def parse_weekdays(label: str | None) -> tuple[set[int], set[tuple[int, int]]]:
    """Dies de la setmana (0 = dilluns) i dates excloses (mes, dia) d'una etiqueta com
    "De dilluns a divendres excepte 12 octubre". Conjunt buit = l'etiqueta no és de dies."""
    if not label:
        return set(), set()
    lower = label.lower()
    main, _, exceptions = lower.partition("excepte")
    excluded = set()
    for day, month in re.findall(r"(\d{1,2})\s+(?:de\s+|d')?(" + "|".join(MONTHS) + ")", exceptions):
        excluded.add((MONTHS.index(month) + 1, int(day)))
    if re.search(r"cada dia|tots els dies|diàriament", main):
        return set(range(7)), excluded
    found = [i for i, d in enumerate(WEEKDAYS) if re.search(rf"\b{d}s?\b", main)]
    span = re.search(r"\bde (\w+) a (\w+)", main)
    names = [w if w in WEEKDAYS else w.removesuffix("s") for w in (span[1], span[2])] if span else []
    if names and all(n in WEEKDAYS for n in names):  # "de dimarts a dissabtes" (plural)
        a, b = WEEKDAYS.index(names[0]), WEEKDAYS.index(names[1])
        return set(range(a, b + 1)) if a <= b else set(range(a, 7)) | set(range(0, b + 1)), excluded
    return set(found), excluded


def is_excluded(day: date, excluded: set[tuple[int, int]]) -> bool:
    return (day.month, day.day) in excluded
