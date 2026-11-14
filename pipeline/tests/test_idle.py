"""Pausa automàtica de les fonts que fa setmanes que no donen cap pla nou."""

from datetime import datetime, timedelta

from event_pipeline import idle
from event_pipeline.config import TIMEZONE

NOW = datetime(2026, 12, 20, 6, 0, tzinfo=TIMEZONE)
OLD = (NOW - timedelta(days=90)).isoformat()


def _source(id, **kw):
    return {"id": id, "name": f"Font {id}", "created_at": OLD, "last_success_at": NOW.isoformat(),
            "discovered_via": "manual", "config": {"adapter": "llm"}, **kw}


class FakeStore:
    def __init__(self, sources, recent_ids):
        self.sources, self.recent_ids = sources, recent_ids
        self.updated = []

    def select(self, table, **params):
        if table == "sources":
            return self.sources
        sid = params["source_id"].removeprefix("eq.")
        assert params["first_seen_at"].startswith("gte.")
        return [{"source_id": sid}] if sid in self.recent_ids else []

    def update(self, table, values, **filters):
        self.updated.append((filters["id"].removeprefix("eq."), values))


def test_pauses_only_sources_without_new_plans_for_the_whole_period():
    store = FakeStore([_source("quiet"), _source("busy")], recent_ids={"busy"})
    assert idle.pause_idle(store, NOW) == ["Font quiet"]
    [(sid, values)] = store.updated
    assert sid == "quiet" and values["status"] == "paused"
    assert values["config"]["adapter"] == "llm"  # es conserva la configuració
    assert values["config"]["auto_paused_at"] == NOW.isoformat()
    assert str(idle.IDLE_DAYS) in values["config"]["auto_paused_reason"]


def test_never_pauses_seed_new_failing_or_recently_reactivated_sources():
    recent = (NOW - timedelta(days=10)).isoformat()
    sources = [
        _source("seed", discovered_via="seed"),                        # fonts de sèrie: mai
        _source("new", created_at=recent),                             # encara no ha tingut temps
        _source("failing", last_success_at=None),                      # els errors ja tenen el seu tractament
        _source("reactivated", config={"adapter": "llm", "active_since": recent}),  # reactivada a mà fa poc
    ]
    store = FakeStore(sources, recent_ids=set())
    assert idle.pause_idle(store, NOW) == []
    assert store.updated == []
