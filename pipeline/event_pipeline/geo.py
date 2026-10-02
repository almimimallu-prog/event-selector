"""Zones de l'usuari i càlcul de distàncies (el filtre exacte; la BD ho repeteix amb PostGIS)."""

from dataclasses import dataclass
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
