"""Descobriment per rastre: els @comptes que mencionen els comptes d'Instagram que seguim es proposen com a fonts
(Configuració → Fonts → «Fonts proposades»). Sempre amb aprovació manual a l'app.

No gasta quota de Gemini: les mencions surten del text dels posts ja desats (raw_items) i el perfil (nom, bio i web)
de l'API de Meta (Business Discovery), la mateixa que llegeix els posts.
"""

import re
from collections.abc import Callable
from datetime import datetime, timedelta

LOOKBACK_DAYS = 45
# Consultes de perfil per execució: l'API de Meta en permet unes 200 per hora, i la llista es completa en uns dies.
MAX_LOOKUPS = 15
NOTE_CHARS = 300

# @compte d'Instagram: no just després d'una lletra (correus com info@lloc.cat) i sense el punt final de la frase.
MENTION = re.compile(r"(?<![\w.@])@([A-Za-z0-9_.]{2,30})")

Profile = dict  # username, name, biography, website, followers_count
Lookup = Callable[[str], Profile | None]  # None: no existeix o no és un compte professional


def mentions_in(caption: str) -> set[str]:
    return {m.rstrip(".").lower() for m in MENTION.findall(caption or "") if m.rstrip(".")}


def count_mentions(posts: list[tuple[str, str]]) -> dict[str, dict]:
    """[(compte que publica, text)] → {compte mencionat: {"mentions": posts que el mencionen, "mentioned_by": [...]}}."""
    counts: dict[str, dict] = {}
    for author, caption in posts:
        for handle in mentions_in(caption) - {author}:
            entry = counts.setdefault(handle, {"mentions": 0, "mentioned_by": set()})
            entry["mentions"] += 1
            entry["mentioned_by"].add(author)
    return {h: {"mentions": c["mentions"], "mentioned_by": sorted(c["mentioned_by"])} for h, c in counts.items()}


def _new_source(handle: str, counts: dict, profile: Profile | None) -> dict:
    config = {"adapter": "instagram", **counts}
    if profile is None:
        return {"name": f"Instagram: @{handle}", "type": "instagram", "handle": handle,
                "url": f"https://www.instagram.com/{handle}/", "status": "rejected", "discovered_via": "trail",
                "discovery_note": "No és un compte professional: no es pot llegir", "config": config}
    name = (profile.get("name") or "").strip()
    return {
        "name": f"Instagram: @{handle}" + (f" ({name[:60]})" if name else ""),
        "type": "instagram",
        "handle": handle,
        "url": f"https://www.instagram.com/{handle}/",
        "status": "proposed",
        "discovered_via": "trail",
        "discovery_note": (profile.get("biography") or "").strip()[:NOTE_CHARS] or None,
        "schedule_hours": 12,
        "config": {**config, "website": profile.get("website") or None, "followers": profile.get("followers_count")},
    }


def run(store, now: datetime, lookup: Lookup) -> int:
    """Actualitza els recomptes de les propostes i en proposa de noves. Retorna quantes n'ha proposat."""
    sources = store.select("sources", select="id,type,handle,status,config", type="eq.instagram")
    known = {s["handle"]: s for s in sources if s.get("handle")}
    followed = {s["id"]: s["handle"] for s in sources if s["status"] == "active" and s.get("handle")}
    since = (now - timedelta(days=LOOKBACK_DAYS)).isoformat()
    raw = store.select("raw_items", select="source_id,payload", external_id="like.post:*", fetched_at=f"gte.{since}")
    posts = [(followed[r["source_id"]], (r.get("payload") or {}).get("caption") or "")
             for r in raw if r.get("source_id") in followed]
    counts = count_mentions(posts)

    for handle, c in counts.items():
        source = known.get(handle)
        if source and source["status"] == "proposed" and {k: (source["config"] or {}).get(k) for k in c} != c:
            store.update("sources", {"config": {**(source["config"] or {}), **c}}, id=f"eq.{source['id']}")

    candidates = sorted((h for h in counts if h not in known), key=lambda h: (-counts[h]["mentions"], h))
    proposed = 0
    for handle in candidates[:MAX_LOOKUPS]:
        row = _new_source(handle, counts[handle], lookup(handle))
        store.insert("sources", row)
        proposed += row["status"] == "proposed"
    return proposed
