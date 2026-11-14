"""Descobriment per rastre: comptes mencionats als posts dels comptes que seguim → «Fonts proposades»."""

from datetime import datetime

from event_pipeline import discover
from event_pipeline.config import TIMEZONE

NOW = datetime(2026, 11, 14, 16, 0, tzinfo=TIMEZONE)

CAPTION = """✨ PLANES para hacer este fin de semana
🎲 Festival DAU: juegos de mesa. @festivaldau
📍 Fabra i Coats @fabraicoatsbcn @fabraicoats.fabricadecreacio
🥨 Tapantoni @tapantoni.
Escríbenos a info@planes.com · #Barcelona @planesenbarcelona"""


def test_mentions_in_caption():
    assert discover.mentions_in(CAPTION) == {
        "festivaldau", "fabraicoatsbcn", "fabraicoats.fabricadecreacio", "tapantoni", "planesenbarcelona"}


def test_count_mentions_ignores_self_and_counts_posts_once():
    posts = [("planesenbarcelona", CAPTION), ("planesenbarcelona", "@festivaldau @festivaldau"),
             ("timeoutbcn", "Al @festivaldau")]
    counts = discover.count_mentions(posts)
    assert "planesenbarcelona" not in counts
    assert counts["festivaldau"] == {"mentions": 3, "mentioned_by": ["planesenbarcelona", "timeoutbcn"]}
    assert counts["tapantoni"]["mentions"] == 1


class FakeStore:
    def __init__(self, sources, raw_items):
        self.sources, self.raw_items = sources, raw_items
        self.inserted, self.updated = [], []

    def select(self, table, **params):
        return {"sources": self.sources, "raw_items": self.raw_items}[table]

    def insert(self, table, rows, on_conflict=None):
        self.inserted.append(rows)
        return [rows]

    def update(self, table, values, **filters):
        self.updated.append((filters["id"], values))


SOURCES = [
    {"id": "s1", "type": "instagram", "handle": "planesenbarcelona", "status": "active", "config": {"adapter": "instagram"}},
    {"id": "s2", "type": "instagram", "handle": "tapantoni", "status": "proposed",
     "config": {"adapter": "instagram", "mentions": 1, "mentioned_by": ["planesenbarcelona"]}},
    {"id": "s3", "type": "instagram", "handle": "fabraicoatsbcn", "status": "rejected", "config": {}},
]
RAW = [{"source_id": "s1", "payload": {"caption": CAPTION}}, {"source_id": "s1", "payload": {"caption": "Torna @tapantoni"}},
       {"source_id": "s2", "payload": {"caption": "@ignorat (font no activa)"}}]


def _lookup(handle):
    if handle == "fabraicoats.fabricadecreacio":
        return None  # no és un compte professional
    return {"username": handle, "name": handle.upper(), "biography": f"Bio de {handle}",
            "website": f"https://{handle}.cat/", "followers_count": 1200}


def test_run_proposes_new_accounts_and_updates_known_ones():
    store = FakeStore(SOURCES, RAW)
    proposed = discover.run(store, NOW, _lookup)

    rows = {r["handle"]: r for r in store.inserted}
    assert proposed == 1
    assert set(rows) == {"festivaldau", "fabraicoats.fabricadecreacio"}  # ni la seguida, ni la rebutjada, ni @ignorat
    dau = rows["festivaldau"]
    assert dau["status"] == "proposed" and dau["discovered_via"] == "trail" and dau["type"] == "instagram"
    assert dau["config"]["website"] == "https://festivaldau.cat/" and dau["config"]["mentioned_by"] == ["planesenbarcelona"]
    assert dau["url"] == "https://www.instagram.com/festivaldau/"
    # Els comptes no professionals es guarden com a rebutjats perquè no es tornin a consultar cada dia.
    assert rows["fabraicoats.fabricadecreacio"]["status"] == "rejected"
    # La proposta que ja hi era s'actualitza amb el recompte nou.
    [(target, values)] = store.updated
    assert target == "eq.s2" and values["config"]["mentions"] == 2


def test_run_respects_lookup_limit():
    caption = " ".join(f"@compte{i}" for i in range(40))
    store = FakeStore(SOURCES[:1], [{"source_id": "s1", "payload": {"caption": caption}}])
    discover.run(store, NOW, _lookup)
    assert len(store.inserted) == discover.MAX_LOOKUPS
