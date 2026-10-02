"""Zones de l'usuari i càlcul de distàncies (el filtre exacte; la BD ho repeteix amb PostGIS)."""

import json
import re
import unicodedata
from dataclasses import dataclass
from functools import cache
from importlib import resources
from math import asin, cos, radians, sin, sqrt


@dataclass(frozen=True)
class Zone:
    name: str
    lat: float
    lon: float
    radius_km: float


# Mateixos valors que supabase/migrations/*_seed_defaults.sql. Quan hi hagi BD, es llegeixen de user_zones.
DEFAULT_ZONES = (
    Zone("Igualada", 41.5789, 1.6175, 30),
    Zone("Barcelona", 41.3874, 2.1686, 15),
)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * 6371 * asin(sqrt(a))


def in_zones(lat: float | None, lon: float | None, zones=DEFAULT_ZONES) -> bool:
    if lat is None or lon is None:
        return False
    return any(haversine_km(lat, lon, z.lat, z.lon) <= z.radius_km for z in zones)


def bounding_box(zones=DEFAULT_ZONES) -> tuple[float, float, float, float]:
    """(lat_min, lat_max, lon_min, lon_max) que conté totes les zones: prefiltre barat per a les API."""
    lats, lons = [], []
    for z in zones:
        dlat = z.radius_km / 111.0
        dlon = z.radius_km / (111.0 * cos(radians(z.lat)))
        lats += [z.lat - dlat, z.lat + dlat]
        lons += [z.lon - dlon, z.lon + dlon]
    return min(lats), max(lats), min(lons), max(lons)


# ─── Municipis ──────────────────────────────────────────────────────────────
# Coordenades dels 947 municipis (dades obertes de la Generalitat, data/municipis.json): situen els
# esdeveniments que només diuen "a Copons" o "(Vilanova del Camí)".

# Noms curts o populars → nom oficial.
_ALIASES = {
    "montbui": "Santa Margarida de Montbui",
    "tous": "Sant Martí de Tous",
}


def _norm(name: str) -> str:
    text = unicodedata.normalize("NFKD", name.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    return re.sub(r"^(l|el|la|els|les)\s+", "", text)  # "El Bruc" i "Bruc" → "bruc"


def _display(name: str) -> str:
    """El conjunt de dades escriu "Bruc, el" i "Albi, l'": → "El Bruc", "L'Albi"."""
    if ", " not in name:
        return name
    base, article = name.rsplit(", ", 1)
    return f"{article.capitalize()}{base}" if article.endswith("'") else f"{article.capitalize()} {base}"


@cache
def _municipalities() -> dict[str, tuple[str, float, float]]:
    raw = json.loads(resources.files("event_pipeline").joinpath("data/municipis.json").read_text("utf-8"))
    table = {}
    for name, lat, lon, _ in raw["municipis"]:
        display = _display(name)
        table[_norm(display)] = (display, lat, lon)
    for alias, official in _ALIASES.items():
        if _norm(official) in table:
            table[_norm(alias)] = table[_norm(official)]
    return table


def locate_municipality(name: str | None) -> tuple[str, float, float] | None:
    """(nom oficial, lat, lon) d'un municipi de Catalunya, o None si no se'l reconeix."""
    if not name:
        return None
    return _municipalities().get(_norm(name.split(",")[0]))
