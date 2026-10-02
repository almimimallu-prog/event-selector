"""Execució del pipeline: fonts que toquen → adaptador o Gemini → `ingest_events` a Supabase.

Ús:  python -m event_pipeline.run                 # fonts actives que toquen per horari
     python -m event_pipeline.run --all           # totes les actives, ara
     python -m event_pipeline.run --source llm    # només un tipus d'adaptador (gencat | bcn | llm)
"""

import argparse
import os
import sys
import traceback
from datetime import date, datetime, timedelta

from . import EXTRACTOR_VERSION
from .adapters import bcn, diba, eventbrite, gencat, instagram, jsonld, tribe
from .clean import html_to_text
from .geo import DEFAULT_ZONES, Zone
from .config import TIMEZONE, load_settings
from .extract import SourceContext, extract
from .gemini import Attachment
from .gemini import QuotaExceeded
from .http import get, make_client
from .sources import SEED_SOURCES, content_hash, item_from_extracted, item_from_source_event
from .store import Store
from . import summarize

HORIZON_DAYS = 60
BATCH = 200
# Reintents després d'errors seguits: 1 h, 6 h, 24 h.
BACKOFF_HOURS = [1, 6, 24]
# Instagram: només publicacions recents i, com a molt, unes quantes per crida a Gemini (una crida per compte).
INSTAGRAM_MAX_AGE_DAYS = 30
INSTAGRAM_MAX_POSTS = 6


def ensure_seed_sources(store: Store) -> None:
    existing = {s["url"] for s in store.select("sources", select="url")}
    missing = [s for s in SEED_SOURCES if s["url"] not in existing]
    if missing:
        for source in missing:  # una a una: PostgREST exigeix les mateixes claus a cada fila d'un lot
            store.insert("sources", source)
        print(f"Fonts llavor afegides: {', '.join(s['name'] for s in missing)}")


def load_zones(store: Store) -> tuple[Zone, ...]:
    """Zones actives editades des de l'app (Configuració). Si no se'n poden llegir, les per defecte."""
    try:
        rows = store.rpc("zone_list", {}, timeout=60)
    except Exception as exc:  # p. ex. migració 20261004000000_zone_list.sql encara no aplicada
        print(f"· Zones: no s'han pogut llegir ({exc}); es fan servir les per defecte")
        return DEFAULT_ZONES
    zones = tuple(Zone(r["name"], r["lat"], r["lon"], float(r["radius_km"])) for r in rows if r["active"])
    return zones or DEFAULT_ZONES


def resolve_eventbrite(source: dict, client, store: Store, token: str) -> str:
    """Les fonts d'Eventbrite afegides des de l'app només porten l'enllaç: se'n busca l'organitzador."""
    config = source.get("config") or {}
    ident, name, page = eventbrite.resolve_organizer(client, token, config.get("pending_url") or source["url"])
    if page != source["url"] and store.select("sources", select="id", url=f"eq.{page}"):
        raise eventbrite.EventbriteError(f"Ja segueixes aquest organitzador ({name}): pots esborrar aquesta font")
    config = {k: v for k, v in config.items() if k != "pending_url"} | {"organizer_id": ident}
    store.update("sources", {"name": f"Eventbrite: {name}", "url": page, "config": config}, id=f"eq.{source['id']}")
    source.update(name=f"Eventbrite: {name}", url=page, config=config)
    return ident


def record_llm_usage(store: Store, usage) -> None:
    provider = "gemini"
    today = date.today().isoformat()
    rows = store.select("llm_usage", day=f"eq.{today}", provider=f"eq.{provider}")
    current = rows[0] if rows else {"calls": 0, "input_tokens": 0, "output_tokens": 0}
    store.insert("llm_usage", {
        "day": today, "provider": provider, "calls": current["calls"] + 1,
        "input_tokens": current["input_tokens"] + usage.input_tokens,
        "output_tokens": current["output_tokens"] + usage.output_tokens,
    }, on_conflict="day,provider")


def collect(source: dict, client, store: Store, settings, now: datetime, zones=DEFAULT_ZONES) -> tuple[list[dict] | None, int]:
    """(items per ingerir o None si la font no ha canviat, crides a l'LLM)."""
    adapter = (source.get("config") or {}).get("adapter")
    today, until = now.date(), now.date() + timedelta(days=HORIZON_DAYS)
    if adapter == "gencat":
        return [item_from_source_event(e) for e in gencat.parse_rows(gencat.fetch(client, today, until, zones), today, until, zones)], 0
    if adapter == "bcn":
        return [item_from_source_event(e) for e in bcn.parse_rows(bcn.fetch(client), today, until, zones)], 0
    config = source.get("config") or {}
    category = config.get("default_category", "cultura")
    if adapter == "diba":
        raw = diba.fetch(client, config["dataset"], today)
        return [item_from_source_event(e) for e in diba.parse_events(raw, config["dataset"], today, until, category, zones)], 0
    if adapter == "tribe":
        raw = tribe.fetch(client, source["url"], today, until)
        name = source["url"].split("//")[-1].strip("/")
        return [item_from_source_event(e) for e in tribe.parse_events(raw, name, today, until, category, zones)], 0
    if adapter == "jsonld":
        raw = jsonld.fetch(client, source["url"])
        return [item_from_source_event(e) for e in jsonld.parse_events(raw, "jsonld", today, until, category, zones)], 0
    if adapter == "eventbrite":
        token = os.getenv("EVENTBRITE_TOKEN")
        if not token:
            raise RuntimeError("Falta EVENTBRITE_TOKEN")
        organizer_id = config.get("organizer_id") or resolve_eventbrite(source, client, store, token)
        raw = eventbrite.fetch_organizer(client, token, organizer_id)
        return [item_from_source_event(e) for e in eventbrite.parse_events(raw, today, until, category, zones)], 0
    if adapter == "llm":
        page = get(client, source["url"], timeout=60).text
        text = html_to_text(page, source["url"])
        page_hash = content_hash({"text": text, "extractor": EXTRACTOR_VERSION})
        page_id = f"page:{source['url']}"
        previous = store.select("raw_items", select="content_hash", source_id=f"eq.{source['id']}",
                                external_id=f"eq.{page_id}")
        if previous and previous[0]["content_hash"] == page_hash:
            return None, 0  # pàgina igual que l'última vegada: no gastem quota de Gemini
        context = SourceContext(source["name"], source["url"], source.get("default_city"))
        result, usage = extract(client, settings.gemini_api_key, text, context, now)
        record_llm_usage(store, usage)
        items = [i for i in (item_from_extracted(e, source, now) for e in result.events) if i]
        # La pàgina es desa al final, perquè si l'extracció falla es torni a provar la propera vegada.
        store.insert("raw_items", {"source_id": source["id"], "external_id": page_id, "url": source["url"],
                                   "content_hash": page_hash, "payload": {"chars": len(text)}, "status": "done",
                                   "extractor_version": EXTRACTOR_VERSION}, on_conflict="source_id,external_id")
        return items, 1
    if adapter == "instagram":
        return collect_instagram(source, client, store, settings, now)
    raise ValueError(f"Adaptador desconegut: {adapter!r}")


def collect_instagram(source: dict, client, store: Store, settings, now: datetime) -> tuple[list[dict] | None, int]:
    token, ig_user_id = os.getenv("INSTAGRAM_TOKEN"), os.getenv("INSTAGRAM_USER_ID")
    if not token or not ig_user_id:
        raise RuntimeError("Falten INSTAGRAM_TOKEN / INSTAGRAM_USER_ID (python -m event_pipeline.manage instagram-setup)")
    posts = instagram.fetch_posts(client, token, ig_user_id, source["handle"])
    recent = [p for p in posts if (now - p.timestamp).days <= INSTAGRAM_MAX_AGE_DAYS]
    ids = ",".join(f'"post:{p.id}"' for p in recent)
    seen = {r["external_id"] for r in store.select("raw_items", select="external_id", source_id=f"eq.{source['id']}",
                                                     external_id=f"in.({ids})")} if recent else set()
    new = [p for p in recent if f"post:{p.id}" not in seen][:INSTAGRAM_MAX_POSTS]
    if not new:
        return None, 0  # cap publicació nova: no gastem quota de Gemini
    attachments = []
    for post in new:
        for url in post.image_urls:
            try:
                response = get(client, url, timeout=30, attempts=2)
                attachments.append(Attachment(response.headers.get("content-type", "image/jpeg").split(";")[0],
                                              response.content))
            except Exception as exc:  # una imatge que no es baixa no ha d'aturar la resta
                print(f"  · imatge de {post.permalink} no disponible ({exc})")
    context = SourceContext(source["name"], source.get("url"), source.get("default_city"))
    result, usage = extract(client, settings.gemini_api_key, instagram.posts_prompt(new), context, now,
                            attachments=tuple(attachments))
    record_llm_usage(store, usage)
    items = [i for i in (item_from_extracted(e, source, now) for e in result.events) if i]
    # Les publicacions es marquen com a llegides al final: si l'extracció falla, es tornen a provar.
    store.insert("raw_items", [{"source_id": source["id"], "external_id": f"post:{p.id}", "url": p.permalink,
                                "content_hash": content_hash({"caption": p.caption, "extractor": EXTRACTOR_VERSION}),
                                "payload": {"caption": p.caption[:2000], "published": p.timestamp.isoformat()},
                                "status": "done", "extractor_version": EXTRACTOR_VERSION} for p in new],
                 on_conflict="source_id,external_id")
    return items, 1


def run_source(source: dict, client, store: Store, settings, now: datetime, zones=DEFAULT_ZONES) -> bool:
    """True si ha anat bé. Els errors queden a scrape_runs i a la salut de la font."""
    [run] = store.insert("scrape_runs", {"source_id": source["id"]})
    try:
        items, llm_calls = collect(source, client, store, settings, now, zones)
        totals = {"unchanged": 0, "created": 0, "merged": 0, "updated": 0, "possible_duplicates": 0}
        if items is None:
            status = "not_modified"
        else:
            status = "ok"
            for start in range(0, len(items), BATCH):
                stats = store.rpc("ingest_events", {"p_source_id": source["id"], "p_items": items[start:start + BATCH]})
                totals = {k: totals[k] + stats.get(k, 0) for k in totals}
        store.update("scrape_runs", {
            "finished_at": datetime.now(TIMEZONE).isoformat(), "status": status,
            "items_found": len(items or []), "items_new": totals["created"] + totals["merged"],
            "events_created": totals["created"], "events_updated": totals["updated"], "llm_calls": llm_calls,
        }, id=f"eq.{run['id']}")
        store.update("sources", {
            "last_run_at": now.isoformat(), "last_success_at": now.isoformat(), "consecutive_failures": 0,
            "last_error": None, "next_run_at": (now + timedelta(hours=source["schedule_hours"])).isoformat(),
        }, id=f"eq.{source['id']}")
        print(f"✓ {source['name']}: {len(items or [])} trobats · {totals['created']} nous · "
              f"{totals['merged']} fusionats · {totals['updated']} actualitzats · {totals['unchanged']} sense canvis"
              + (f" · {totals['possible_duplicates']} possibles duplicats" if totals["possible_duplicates"] else "")
              + (" · pàgina sense canvis" if status == "not_modified" else ""))
        return True
    except Exception as exc:
        failures = source.get("consecutive_failures", 0) + 1
        wait = BACKOFF_HOURS[min(failures, len(BACKOFF_HOURS)) - 1]
        # Quota esgotada: no és culpa de la font, es torna a provar l'endemà sense comptar-ho com a error.
        if isinstance(exc, QuotaExceeded):
            failures, wait = source.get("consecutive_failures", 0), 24
        message = f"{type(exc).__name__}: {exc}"[:1000]
        store.update("scrape_runs", {"finished_at": datetime.now(TIMEZONE).isoformat(), "status": "error",
                                     "error": message}, id=f"eq.{run['id']}")
        store.update("sources", {"last_run_at": now.isoformat(), "consecutive_failures": failures,
                                 "last_error": message,
                                 "next_run_at": (now + timedelta(hours=wait)).isoformat()}, id=f"eq.{source['id']}")
        print(f"✗ {source['name']}: {message}")
        traceback.print_exc()
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all", action="store_true", help="executa totes les fonts actives, toquin o no")
    parser.add_argument("--source", choices=["gencat", "bcn", "llm", "diba", "tribe", "jsonld", "eventbrite", "instagram"],
                        help="només un tipus d'adaptador")
    parser.add_argument("--no-summaries", action="store_true", help="no generar explicacions amb Gemini")
    args = parser.parse_args()

    settings = load_settings()
    now = datetime.now(TIMEZONE)
    with make_client() as client:
        store = Store(client, settings.supabase_url, settings.supabase_service_role_key)
        ensure_seed_sources(store)
        zones = load_zones(store)
        filters = {"status": "eq.active", "order": "next_run_at"}
        if not (args.all or args.source):
            filters["next_run_at"] = f"lte.{now.isoformat()}"
        sources = store.select("sources", **filters)
        if args.source:
            sources = [s for s in sources if (s.get("config") or {}).get("adapter") == args.source]
        # Sense accés a Instagram configurat, aquestes fonts s'esperen (no compten com a errors).
        if not (os.getenv("INSTAGRAM_TOKEN") and os.getenv("INSTAGRAM_USER_ID")):
            waiting = [s for s in sources if (s.get("config") or {}).get("adapter") == "instagram"]
            if waiting:
                print(f"· Instagram: {len(waiting)} comptes en espera (falta instagram-setup)")
                sources = [s for s in sources if s not in waiting]
        if not sources:
            print("Cap font per executar ara.")
        results = [run_source(source, client, store, settings, now, zones) for source in sources]
        if not args.no_summaries:
            try:
                done = summarize.run(client, store, settings.gemini_api_key, now, record_llm_usage)
                if done:
                    print(f"✓ Explicacions noves: {done}")
            except QuotaExceeded:
                print("· Explicacions: quota de Gemini esgotada, es continuarà a la propera execució")
    # Si han fallat TOTES les fonts, alguna cosa general va malament (claus, Supabase, xarxa): error visible.
    if results and not any(results):
        sys.exit("Han fallat totes les fonts")


if __name__ == "__main__":
    main()
