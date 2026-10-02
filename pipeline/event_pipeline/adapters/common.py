"""Peces compartides pels adaptadors."""

import re
from datetime import date, datetime, time, timedelta

from ..config import TIMEZONE

# Més dies que això sense sessions concretes → "llarga durada" (exposicions, cicles, temporades).
MAX_DAILY_EXPANSION_DAYS = 6


def occurrence_days(day0: date, day1: date | None, today: date, until: date) -> list[tuple[date, bool]]:
    """[(dia, és_llarga_durada)]. Fins a 7 dies: una sessió per dia (fira de cap de setmana).
    day1=None vol dir "permanent" (sense data de fi coneguda): llarga durada."""
    if day1 is None or day1 < day0:
        return [(day0, True)] if day1 is None else []
    if (day1 - day0).days > MAX_DAILY_EXPANSION_DAYS:
        return [(day0, True)] if day1 >= today and day0 <= until else []
    days = (day0 + timedelta(days=i) for i in range((day1 - day0).days + 1))
    return [(d, False) for d in days if today <= d <= until]


def at(day: date, t: time | None) -> datetime:
    return datetime.combine(day, t or time(0), TIMEZONE)


def end_of(day: date) -> datetime:
    return datetime.combine(day, time(23, 59, 59), TIMEZONE)


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60]
