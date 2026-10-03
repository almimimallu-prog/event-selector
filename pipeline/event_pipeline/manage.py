"""Gestió des de la línia d'ordres (les fonts i les zones també es gestionen a l'app, a Configuració).

Ús:  python -m event_pipeline.manage eventbrite-add <enllaç d'organitzador o d'esdeveniment d'Eventbrite>
     python -m event_pipeline.manage list
     python -m event_pipeline.manage set-password <correu>
     python -m event_pipeline.manage instagram-setup
     python -m event_pipeline.manage instagram-add <compte> [<compte>...] [--city Igualada] [--label "Teatre"]
     python -m event_pipeline.manage ics-add <grup de Meetup o calendari .ics> [...] [--city Barcelona]
"""

import argparse
import getpass
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

from .adapters import eventbrite, ics, instagram
from .config import load_settings
from .geo import locate_municipality
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


ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def _save_env(values: dict[str, str]) -> None:
    """Afegeix o substitueix variables a pipeline/.env (ignorat per git)."""
    lines = ENV_FILE.read_text("utf-8").splitlines() if ENV_FILE.exists() else []
    lines = [line for line in lines if line.split("=", 1)[0].strip() not in values]
    lines += [f"{k}={v}" for k, v in values.items()]
    ENV_FILE.write_text("\n".join(lines) + "\n", "utf-8")


def _save_github_secrets(values: dict[str, str]) -> bool:
    if not shutil.which("gh"):
        return False
    for name, value in values.items():
        # El valor va per l'entrada estàndard: no surt a la pantalla ni a l'historial.
        result = subprocess.run(["gh", "secret", "set", name], input=value, text=True, cwd=REPO_ROOT,
                                capture_output=True)
        if result.returncode != 0:
            print(f"  · No s'ha pogut desar el secret {name} a GitHub: {result.stderr.strip()}")
            return False
    return True


def instagram_setup(client) -> None:
    """Obté un token de Meta i l'id del compte professional propi, i els desa a .env i als Secrets de GitHub."""
    print("Dades de l'app de Meta (developers.facebook.com → la teva app → Configuració de l'app → Bàsica).")
    print("El que escriguis no es mostra per pantalla.\n")
    app_id = input("Identificador de l'app (App ID): ").strip()
    app_secret = getpass.getpass("Clau secreta de l'app (App Secret): ").strip()
    short_token = getpass.getpass("Token d'accés de l'Explorador de l'API Graph: ").strip()

    response = client.get(instagram.graph_url("oauth/access_token"), timeout=60, params={
        "grant_type": "fb_exchange_token", "client_id": app_id, "client_secret": app_secret,
        "fb_exchange_token": short_token,
    })
    if response.status_code >= 400:
        sys.exit(f"Meta no ha acceptat les dades: {response.json().get('error', {}).get('message', response.text[:300])}")
    user_token = response.json()["access_token"]  # dura uns 60 dies

    try:
        pages = instagram._get(client, user_token, "me/accounts",
                               fields="name,access_token,instagram_business_account{id,username}").get("data", [])
    except instagram.InstagramError as exc:
        sys.exit(str(exc))
    linked = [p for p in pages if p.get("instagram_business_account")]
    if not linked:
        if not pages:
            sys.exit("El token no dona accés a cap pàgina de Facebook. A l'Explorador, afegeix el permís "
                     "business_management, torna a clicar «Generate Access Token» i, a la finestra de Meta, tria "
                     "«Editar configuració» i marca la pàgina i el compte d'Instagram.")
        names = ", ".join(p.get("name", "?") for p in pages)
        sys.exit(f"Pàgines visibles amb aquest token: {names}. Cap no té un compte d'Instagram professional vinculat "
                 "que el token pugui veure: torna a generar el token marcant també el compte d'Instagram.")
    page = linked[0]
    if len(linked) > 1:
        for i, p in enumerate(linked, 1):
            print(f"  {i}. {p['name']} → @{p['instagram_business_account'].get('username')}")
        page = linked[int(input("Quin compte vols fer servir? ")) - 1]
    ig_user_id = page["instagram_business_account"]["id"]

    # El token de pàgina obtingut d'un token llarg no caduca; si Meta no l'accepta per a Business Discovery,
    # es fa servir el d'usuari (llavors cal repetir aquest pas cada ~60 dies).
    token, expires = None, False
    for candidate, candidate_expires in ((page.get("access_token"), False), (user_token, True)):
        if not candidate:
            continue
        try:
            instagram.fetch_posts(client, candidate, ig_user_id, "instagram", limit=1)
            token, expires = candidate, candidate_expires
            break
        except instagram.InstagramError as exc:
            print(f"  · prova amb el token {'d usuari' if candidate_expires else 'de pàgina'}: {exc}")
    if not token:
        sys.exit("Meta no permet consultar altres comptes amb aquest token. Revisa els permisos (pas 3).")

    values = {"INSTAGRAM_TOKEN": token, "INSTAGRAM_USER_ID": ig_user_id}
    _save_env(values)
    print(f"✓ Desat a pipeline/.env (compte @{page['instagram_business_account'].get('username')}).")
    if _save_github_secrets(values):
        print("✓ Desat també als Secrets de GitHub (INSTAGRAM_TOKEN i INSTAGRAM_USER_ID).")
    else:
        print("· Afegeix INSTAGRAM_TOKEN i INSTAGRAM_USER_ID als Secrets de GitHub (els valors són a pipeline/.env).")
    if expires:
        print("· Aquest token caduca d'aquí a uns 60 dies: llavors torna a executar instagram-setup.")


def instagram_add(store: Store, client, handles: list[str], city: str | None, label: str | None) -> None:
    place = locate_municipality(city) if city else None
    if city and not place:
        sys.exit(f"No reconec el municipi «{city}».")
    token, ig_user_id = os.getenv("INSTAGRAM_TOKEN"), os.getenv("INSTAGRAM_USER_ID")
    for raw in handles:
        handle = instagram.parse_handle(raw)
        if not handle:
            print(f"✗ «{raw}» no és un compte d'Instagram vàlid")
            continue
        if store.select("sources", select="id", type="eq.instagram", handle=f"eq.{handle}"):
            print(f"· @{handle}: ja el segueixes")
            continue
        if token and ig_user_id:  # amb l'accés configurat, es comprova abans de desar
            try:
                posts = instagram.fetch_posts(client, token, ig_user_id, handle, limit=3)
                print(f"  @{handle}: compte professional, {len(posts)} publicacions llegibles")
            except instagram.InstagramError as exc:
                print(f"✗ @{handle}: {exc}")
                continue
        store.insert("sources", {
            "name": f"Instagram: @{handle}" + (f" ({label})" if label else ""), "type": "instagram",
            "handle": handle, "url": f"https://www.instagram.com/{handle}/", "config": {"adapter": "instagram"},
            "schedule_hours": 12, "default_city": place[0] if place else None, "discovered_via": "manual",
        })
        print(f"✓ @{handle} afegit")


def ics_add(store: Store, client, urls: list[str], city: str | None) -> None:
    """Grups de Meetup (enllaç del grup) o calendaris .ics."""
    place = locate_municipality(city) if city else None
    if city and not place:
        sys.exit(f"No reconec el municipi «{city}».")
    for raw in urls:
        url = ics.meetup_ical_url(raw) if "meetup.com" in raw else raw.replace("webcal://", "https://")
        if not url:
            print(f"✗ «{raw}» no és l'enllaç d'un grup de Meetup")
            continue
        if store.select("sources", select="id", url=f"eq.{url}"):
            print(f"· {raw}: ja la segueixes")
            continue
        try:
            text = ics.fetch(client, url)
        except Exception as exc:
            print(f"✗ {raw}: no s'ha pogut llegir el calendari ({exc})")
            continue
        if "BEGIN:VCALENDAR" not in text:
            print(f"✗ {raw}: no és un calendari iCal")
            continue
        m = re.search(r"^X-WR-CALNAME:(.+)$", text, re.M)
        label = m[1].strip() if m else url
        name = f"{'Meetup' if 'meetup.com' in url else 'Calendari'}: {label}"
        store.insert("sources", {
            "name": name, "type": "ics", "url": url, "config": {"adapter": "ics"}, "schedule_hours": 24,
            "default_city": place[0] if place else None, "discovered_via": "manual",
        })
        print(f"✓ {name} ({text.count('BEGIN:VEVENT')} esdeveniments al calendari ara mateix)")


RECLASSIFY_ADAPTERS = {"ics", "eventbrite", "jsonld", "tribe"}


def reclassify(store: Store, dry_run: bool) -> None:
    """Torna a classificar els esdeveniments futurs de les fonts sense categories pròpies (Meetup, Eventbrite,
    webs) amb les regles actuals i la categoria per defecte de cada font. No toca les categories corregides
    a mà ni els esdeveniments que també vénen d'altres fonts (Agenda Cultural, Gemini...)."""
    from datetime import date

    from .categories import classify

    sources = {s["id"]: s for s in store.select("sources", select="id,name,config")}
    links: list[dict] = []
    while True:  # PostgREST en retorna com a molt 1000 per petició
        page = store.select("event_sources", order="event_id,raw_item_id", limit="1000", offset=str(len(links)),
                            select="event_id,source_id,events(title,description,category,locked_fields,start_at,end_at)")
        links += page
        if len(page) < 1000:
            break
    by_event: dict[str, list] = {}
    for link in links:
        if link["events"]:
            by_event.setdefault(link["event_id"], []).append(link)
    today = date.today().isoformat()
    changes = []
    for event_id, rows in by_event.items():
        event = rows[0]["events"]
        if (event["end_at"] or event["start_at"]) < today or "category" in (event["locked_fields"] or []):
            continue
        configs = [(sources.get(r["source_id"]) or {}).get("config") or {} for r in rows]
        if any(c.get("adapter") not in RECLASSIFY_ADAPTERS for c in configs):
            continue
        default = next((c["default_category"] for c in configs if c.get("default_category")), None)
        new = classify(event["title"], event["description"], default=default) or "cultura"
        if new != event["category"]:
            changes.append((event_id, event["category"], new, event["title"]))
    for event_id, old, new, title in changes:
        print(f"  {old:>18} → {new:<18} {title[:70]}")
        if not dry_run:
            store.update("events", {"category": new}, id=f"eq.{event_id}")
    print(f"{'Es canviarien' if dry_run else '✓ Canviats'}: {len(changes)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    add = sub.add_parser("eventbrite-add", help="segueix un organitzador d'Eventbrite")
    add.add_argument("url")
    sub.add_parser("list", help="llista les fonts")
    pw = sub.add_parser("set-password", help="posa la contrasenya d'entrada a l'app")
    pw.add_argument("email")
    sub.add_parser("instagram-setup", help="configura l'accés a Instagram (API de Meta)")
    ig = sub.add_parser("instagram-add", help="segueix comptes d'Instagram professionals")
    ig.add_argument("handles", nargs="+")
    ig.add_argument("--city", help="municipi per defecte dels esdeveniments")
    ig.add_argument("--label", help="descripció curta (p. ex. «Teatre de l'Aurora»)")
    rc = sub.add_parser("reclassify", help="torna a classificar els esdeveniments de Meetup, Eventbrite i webs")
    rc.add_argument("--dry-run", action="store_true", help="només mostra què canviaria")
    ica = sub.add_parser("ics-add", help="segueix grups de Meetup o calendaris .ics")
    ica.add_argument("urls", nargs="+")
    ica.add_argument("--city", help="municipi per defecte (si el calendari no diu on és)")
    args = parser.parse_args()

    load_dotenv()
    settings = load_settings()
    with make_client() as client:
        store = Store(client, settings.supabase_url, settings.supabase_service_role_key)
        if args.command == "eventbrite-add":
            eventbrite_add(store, client, args.url)
        elif args.command == "set-password":
            set_password(client, settings, args.email)
        elif args.command == "instagram-setup":
            instagram_setup(client)
        elif args.command == "reclassify":
            reclassify(store, args.dry_run)
        elif args.command == "ics-add":
            ics_add(store, client, args.urls, args.city)
        elif args.command == "instagram-add":
            instagram_add(store, client, args.handles, args.city, args.label)
        else:
            for s in store.select("sources", select="name,status,last_success_at,consecutive_failures", order="name"):
                print(f"  {'●' if s['status'] == 'active' else '○'} {s['name']}"
                      + (f"  ⚠ {s['consecutive_failures']} errors" if s["consecutive_failures"] else ""))


if __name__ == "__main__":
    main()
