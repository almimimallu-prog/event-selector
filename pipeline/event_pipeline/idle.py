"""Pausa automàtica de les fonts que funcionen però fa setmanes que no donen cap pla nou (p. ex. un festival que ja
s'ha acabat o un grup de Meetup inactiu): estalvia lectures i quota de Gemini. Es reactiven a l'app (Configuració →
Fonts) i, en reactivar-les, el comptador torna a començar.

No es pausen mai les fonts de sèrie, les que fa poc que s'han afegit o reactivat, ni les que donen errors (aquestes
ja tenen els reintents espaiats de run.py).
"""

from datetime import datetime, timedelta

IDLE_DAYS = 60


def _since(source: dict) -> datetime:
    """Des de quan compta: alta de la font o darrera reactivació a mà."""
    dates = [source["created_at"], (source.get("config") or {}).get("active_since")]
    return max(datetime.fromisoformat(d) for d in dates if d)


def pause_idle(store, now: datetime) -> list[str]:
    """Pausa les fonts actives sense cap pla nou en IDLE_DAYS dies. Retorna els noms de les pausades."""
    cutoff = now - timedelta(days=IDLE_DAYS)
    sources = store.select("sources", select="id,name,created_at,last_success_at,discovered_via,config",
                           status="eq.active")
    paused = []
    for source in sources:
        if source.get("discovered_via") == "seed" or not source.get("last_success_at") or _since(source) > cutoff:
            continue
        recent = store.select("event_sources", select="source_id", source_id=f"eq.{source['id']}",
                              first_seen_at=f"gte.{cutoff.isoformat()}", limit="1")
        if recent:
            continue
        config = {**(source.get("config") or {}), "auto_paused_at": now.isoformat(),
                  "auto_paused_reason": f"Cap pla nou en {IDLE_DAYS} dies"}
        store.update("sources", {"status": "paused", "config": config}, id=f"eq.{source['id']}")
        paused.append(source["name"])
    return paused
