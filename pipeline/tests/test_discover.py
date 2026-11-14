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


# Així arriba el text per l'API de Meta: sense «@», i la menció deixa un espai al final de la línia.
# (Els espais finals s'escriuen amb " \n" perquè els editors no els esborrin.)
API_CAPTION = " \n".join([
    "✨ PLANES para hacer este fin de semana 👇",
    "🎲 Festival DAU: gran festival de juegos de mesa para todas las edades. festivaldau",
    "📍 Fabra i Coats fabraicoatsbcn fabraicoats.fabricadecreacio",
    "🍢 Tapantoni: ruta de tapas por los locales de Sant Antoni. tapantoni",
    "🎟️ Entradas en el link de la bio",
    "Aquest any les persones ho van gaudir molt.",
    "Tornem el 2026. ",
])


def test_mentions_in_caption():
    assert discover.mentions_in(CAPTION) == {
        "festivaldau", "fabraicoatsbcn", "fabraicoats.fabricadecreacio", "tapantoni", "planesenbarcelona"}


def test_mentions_without_at_sign_from_the_api():
    found = discover.mentions_in(API_CAPTION)
    assert {"festivaldau", "fabraicoatsbcn", "fabraicoats.fabricadecreacio", "tapantoni"} <= found
    # Ni paraules curtes, ni majúscules, ni finals de frase, ni números.
    assert not found & {"Coats", "bio", "molt.", "2026.", "2026"}


def test_count_mentions_drops_words_used_as_normal_text():
    other = "Les persones que vulguin venir poden apuntar-se. Hi haurà persones de tot arreu."
    counts = discover.count_mentions([("planesenbarcelona", API_CAPTION), ("ajigualada", other)])
    assert "persones" not in counts and "festivaldau" in counts
    # «Tapantoni:» amb majúscula al títol no compta com a text normal.
    assert "tapantoni" in counts


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


def _client(status, body):
    import httpx
    return httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(status, json=body)))


def test_fetch_profile_unknown_account_in_any_language_is_none():
    from event_pipeline.adapters import instagram
    body = {"error": {"message": "No se encuentra al usuario con el nombre noexisteix.", "code": 110,
                      "error_subcode": 2207013, "type": "OAuthException"}}
    with _client(400, body) as client:
        assert instagram.fetch_profile(client, "token", "123", "noexisteix") is None


def test_fetch_profile_other_errors_are_raised():
    import pytest
    from event_pipeline.adapters import instagram
    with _client(400, {"error": {"message": "Token caducat", "code": 190}}) as client, \
            pytest.raises(instagram.InstagramError):
        instagram.fetch_profile(client, "token", "123", "festivaldau")


def _classify(profiles):
    """Fals classificador: «festivaldau» organitza coses; la resta no."""
    _classify.calls.append([p["handle"] for p in profiles])
    return {p["handle"]: {"relevant": p["handle"] == "festivaldau", "reason": f"motiu {p['handle']}"} for p in profiles}


def test_run_classifies_new_and_unclassified_proposals():
    _classify.calls = []
    store = FakeStore(SOURCES, RAW)
    discover.run(store, NOW, _lookup, _classify)

    rows = {r["handle"]: r for r in store.inserted}
    assert rows["festivaldau"]["config"]["relevant"] is True
    assert rows["festivaldau"]["config"]["relevance_reason"] == "motiu festivaldau"
    # Els no professionals no es classifiquen; la proposta antiga sense classificar, sí (una sola crida).
    assert "relevant" not in rows["fabraicoats.fabricadecreacio"]["config"]
    assert _classify.calls == [["festivaldau", "tapantoni"]]
    [(target, values)] = [u for u in store.updated if "relevant" in u[1]["config"]]
    assert target == "eq.s2" and values["config"]["relevant"] is False and values["config"]["mentions"] == 2


def test_run_without_classifier_or_when_it_fails_still_proposes():
    def broken(profiles):
        raise RuntimeError("Groq 429")
    for classify in (None, broken):
        store = FakeStore(SOURCES, RAW)
        assert discover.run(store, NOW, _lookup, classify) == 1
        assert "relevant" not in {r["handle"]: r for r in store.inserted}["festivaldau"]["config"]


def test_relevance_parses_groq_answer():
    import json

    import httpx

    from event_pipeline import relevance
    answer = {"profiles": [{"handle": "festivaldau", "relevant": True, "reason": "Festival de jocs a Barcelona"},
                           {"handle": "revlon_es", "relevant": False, "reason": "Marca de cosmètics"}]}
    seen = {}

    def handler(request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(answer)}}]})

    profiles = [{"handle": "festivaldau", "name": "Festival DAU", "bio": "Festival del joc", "website": None, "mentioned_by": []},
                {"handle": "revlon_es", "name": "Revlon", "bio": "Maquillatge", "website": None, "mentioned_by": []}]
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        verdicts = relevance.classify(client, "key", profiles)
    assert verdicts == {"festivaldau": {"relevant": True, "reason": "Festival de jocs a Barcelona"},
                        "revlon_es": {"relevant": False, "reason": "Marca de cosmètics"}}
    assert seen["body"]["model"] == relevance.MODEL and "festivaldau" in seen["body"]["messages"][-1]["content"]


def test_run_respects_lookup_limit():
    caption = " ".join(f"@compte{i}" for i in range(40))
    store = FakeStore(SOURCES[:1], [{"source_id": "s1", "payload": {"caption": caption}}])
    discover.run(store, NOW, _lookup)
    assert len(store.inserted) == discover.MAX_LOOKUPS
