"""Gestió de fonts des de la línia d'ordres (fins que hi hagi el gestor de fonts a l'app, Fase 2).

Ús:  python -m event_pipeline.manage eventbrite-add <enllaç d'organitzador o d'esdeveniment d'Eventbrite>
     python -m event_pipeline.manage list
"""

import argparse
import os
import sys

from dotenv import load_dotenv

from .adapters import eventbrite
from .config import load_settings
from .http import make_client
from .store import Store


def eventbrite_add(store: Store, client, url: str) -> None:
    token = os.getenv("EVENTBRITE_TOKEN")
    if not token:
        sys.exit("Falta EVENTBRITE_TOKEN a pipeline/.env")
    parsed = eventbrite.parse_url(url)
    if not parsed:
        sys.exit("No és un enllaç d'Eventbrite reconegut (/o/… d'organitzador o /e/… d'esdeveniment).")
    kind, ident = parsed
    event_title = None
    if kind == "event":
        event = eventbrite.fetch_event(client, token, ident)
        ident = event.get("organizer_id")
        if not ident:
            sys.exit("Aquest esdeveniment no indica organitzador.")
        event_title = event["name"]["text"].strip()
        print(f"Esdeveniment «{event_title}» → organitzador {ident}")
    organizer = eventbrite._get(client, token, f"/organizers/{ident}/")
    # Alguns organitzadors no tenen nom al perfil: es fa servir el títol de l'esdeveniment per reconèixer-lo.
    name = organizer.get("name") or (f"organitzador de «{event_title}»" if event_title else f"organitzador {ident}")
    events = eventbrite.fetch_organizer(client, token, ident)  # comprova que l'API ho permet abans de desar
    page = organizer.get("url") or f"https://www.eventbrite.com/o/{ident}"
    if store.select("sources", select="id", url=f"eq.{page}"):
        print(f"Ja la seguies: {name}")
        return
    store.insert("sources", {
        "name": f"Eventbrite: {name}", "type": "api", "url": page,
        "config": {"adapter": "eventbrite", "organizer_id": ident}, "schedule_hours": 24,
        "discovered_via": "manual",
    })
    print(f"✓ Font afegida: Eventbrite: {name} ({len(events)} esdeveniments publicats ara mateix)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    add = sub.add_parser("eventbrite-add", help="segueix un organitzador d'Eventbrite")
    add.add_argument("url")
    sub.add_parser("list", help="llista les fonts")
    args = parser.parse_args()

    load_dotenv()
    settings = load_settings()
    with make_client() as client:
        store = Store(client, settings.supabase_url, settings.supabase_service_role_key)
        if args.command == "eventbrite-add":
            eventbrite_add(store, client, args.url)
        else:
            for s in store.select("sources", select="name,status,last_success_at,consecutive_failures", order="name"):
                print(f"  {'●' if s['status'] == 'active' else '○'} {s['name']}"
                      + (f"  ⚠ {s['consecutive_failures']} errors" if s["consecutive_failures"] else ""))


if __name__ == "__main__":
    main()
