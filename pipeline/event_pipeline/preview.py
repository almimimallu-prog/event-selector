"""Previsualització d'una font sense base de dades.

Ús:  python -m event_pipeline.preview gencat|bcn [--days 14]
"""

import argparse
from collections import Counter
from datetime import date, timedelta

from .adapters import bcn, gencat
from .geo import DEFAULT_ZONES, haversine_km
from .http import make_client

WEEKDAYS = ["Dl", "Dm", "Dc", "Dj", "Dv", "Ds", "Dg"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", choices=["gencat", "bcn"])
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--sample", type=int, default=15)
    args = parser.parse_args()

    today = date.today()
    until = today + timedelta(days=args.days)
    with make_client() as client:
        if args.source == "gencat":
            events = gencat.parse_rows(gencat.fetch(client, today, until), today, until)
        else:
            events = bcn.parse_rows(bcn.fetch(client), today, until)

    def zone(e):
        return min(DEFAULT_ZONES, key=lambda z: haversine_km(e.lat, e.lon, z.lat, z.lon)).name

    dated = sorted((e for e in events if e.kind == "session"), key=lambda e: e.start)
    kinds = Counter(e.kind for e in events)
    print(f"\n{args.source}: {len(dated)} sessions en {args.days} dies · "
          f"{kinds['long_running']} de llarga durada · {kinds['course']} cursos")
    print("Per zona:      ", dict(Counter(zone(e) for e in events)))
    print("Per categoria: ", dict(Counter(e.category for e in events)))
    print("Categoria incerta:", sum(e.category_guessed for e in events),
          "· Sense hora:", sum(e.all_day for e in dated),
          "· Gratuïts:", sum(bool(e.is_free) for e in events),
          "· Amb imatge:", sum(bool(e.image_url) for e in events),
          "· Sessions de cicles:", sum(bool(e.series_key) for e in events))
    print("Per dia:       ", " ".join(f"{WEEKDAYS[d.weekday()]}{d.day}:{n}"
                                     for d, n in sorted(Counter(e.start.date() for e in dated).items())))
    print("\nMostra:")
    for e in dated[: args.sample]:
        when = e.start.strftime("%a %d/%m") + ("  tot el dia" if e.all_day else e.start.strftime("  %H:%M"))
        price = "gratuït" if e.is_free else (e.price_text or "?")
        print(f"  {when:<20} {e.title[:48]:<48} | {e.city or '?':<14} | {e.category:<18} | {price[:22]}")


if __name__ == "__main__":
    main()
