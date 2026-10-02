"""Gestió des de la línia d'ordres (les fonts i les zones també es gestionen a l'app, a Configuració).

Ús:  python -m event_pipeline.manage eventbrite-add <enllaç d'organitzador o d'esdeveniment d'Eventbrite>
     python -m event_pipeline.manage list
     python -m event_pipeline.manage set-password <correu>
"""

import argparse
import getpass
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
    try:
        ident, name, page = eventbrite.resolve_organizer(client, token, url)
    except eventbrite.EventbriteError as exc:
        sys.exit(str(exc))
    events = eventbrite.fetch_organizer(client, token, ident)  # comprova que l'API ho permet abans de desar
    if store.select("sources", select="id", url=f"eq.{page}"):
        print(f"Ja la seguies: {name}")
        return
    store.insert("sources", {
        "name": f"Eventbrite: {name}", "type": "api", "url": page,
        "config": {"adapter": "eventbrite", "organizer_id": ident}, "schedule_hours": 24,
        "discovered_via": "manual",
    })
    print(f"✓ Font afegida: Eventbrite: {name} ({len(events)} esdeveniments publicats ara mateix)")


def set_password(client, settings, email: str) -> None:
    """Posa la contrasenya d'entrada a l'app amb l'API d'administració de Supabase.

    La contrasenya es demana per teclat (no es mostra ni queda a l'historial de la terminal).
    """
    base = f"{settings.supabase_url}/auth/v1/admin/users"
    headers = {"apikey": settings.supabase_service_role_key}
    resp = client.get(base, headers=headers, params={"page": 1, "per_page": 200})
    resp.raise_for_status()
    user = next((u for u in resp.json()["users"] if (u.get("email") or "").lower() == email.lower()), None)
    if not user:
        sys.exit(f"No hi ha cap usuari amb el correu {email} a Supabase.")
    password = getpass.getpass("Contrasenya nova (mínim 8 caràcters, no es veu mentre escrius): ")
    if len(password) < 8:
        sys.exit("Ha de tenir com a mínim 8 caràcters.")
    if getpass.getpass("Repeteix-la: ") != password:
        sys.exit("Les dues contrasenyes no coincideixen.")
    resp = client.put(f"{base}/{user['id']}", headers=headers, json={"password": password})
    if resp.status_code >= 400:
        sys.exit(f"Supabase no l'ha acceptada: {resp.text}")
    print(f"✓ Contrasenya desada per a {email}. Ja pots entrar a l'app amb la pestanya «Contrasenya».")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    add = sub.add_parser("eventbrite-add", help="segueix un organitzador d'Eventbrite")
    add.add_argument("url")
    sub.add_parser("list", help="llista les fonts")
    pw = sub.add_parser("set-password", help="posa la contrasenya d'entrada a l'app")
    pw.add_argument("email")
    args = parser.parse_args()

    load_dotenv()
    settings = load_settings()
    with make_client() as client:
        store = Store(client, settings.supabase_url, settings.supabase_service_role_key)
        if args.command == "eventbrite-add":
            eventbrite_add(store, client, args.url)
        elif args.command == "set-password":
            set_password(client, settings, args.email)
        else:
            for s in store.select("sources", select="name,status,last_success_at,consecutive_failures", order="name"):
                print(f"  {'●' if s['status'] == 'active' else '○'} {s['name']}"
                      + (f"  ⚠ {s['consecutive_failures']} errors" if s["consecutive_failures"] else ""))


if __name__ == "__main__":
    main()
