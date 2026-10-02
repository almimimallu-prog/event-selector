from event_pipeline import run
from event_pipeline.adapters import eventbrite
from event_pipeline.geo import DEFAULT_ZONES, Zone


class FakeStore:
    def __init__(self, zones=None, error=None, existing=()):
        self.zones, self.error, self.existing, self.updates = zones, error, existing, []

    def rpc(self, function, args, timeout=300):
        if self.error:
            raise self.error
        return self.zones

    def select(self, table, **params):
        return [{"id": "x"}] if params.get("url", "").removeprefix("eq.") in self.existing else []

    def update(self, table, values, **filters):
        self.updates.append((table, values, filters))


def test_load_zones_only_active():
    store = FakeStore(zones=[
        {"name": "Igualada", "lat": 41.58, "lon": 1.62, "radius_km": "30.0", "active": True},
        {"name": "Manresa", "lat": 41.73, "lon": 1.83, "radius_km": "20.0", "active": False},
    ])
    assert run.load_zones(store) == (Zone("Igualada", 41.58, 1.62, 30.0),)


def test_load_zones_falls_back_when_missing():
    assert run.load_zones(FakeStore(error=RuntimeError("Supabase 404"))) == DEFAULT_ZONES
    assert run.load_zones(FakeStore(zones=[])) == DEFAULT_ZONES


def test_resolve_eventbrite_completes_source(monkeypatch):
    page = "https://www.eventbrite.es/o/wedding-market-123456789"
    monkeypatch.setattr(eventbrite, "resolve_organizer", lambda client, token, url: ("123456789", "Wedding Market", page))
    source = {"id": "s1", "url": "https://www.eventbrite.es/e/x-1995681887247",
              "config": {"adapter": "eventbrite", "pending_url": "https://www.eventbrite.es/e/x-1995681887247"}}
    store = FakeStore()
    assert run.resolve_eventbrite(source, None, store, "token") == "123456789"
    [(table, values, filters)] = store.updates
    assert values == {"name": "Eventbrite: Wedding Market", "url": page,
                      "config": {"adapter": "eventbrite", "organizer_id": "123456789"}}
    assert filters == {"id": "eq.s1"}


def test_resolve_eventbrite_already_followed(monkeypatch):
    page = "https://www.eventbrite.es/o/wedding-market-123456789"
    monkeypatch.setattr(eventbrite, "resolve_organizer", lambda client, token, url: ("123456789", "Wedding Market", page))
    source = {"id": "s1", "url": "https://www.eventbrite.es/e/x-1995681887247", "config": {"adapter": "eventbrite"}}
    try:
        run.resolve_eventbrite(source, None, FakeStore(existing=(page,)), "token")
    except eventbrite.EventbriteError as exc:
        assert "Ja segueixes" in str(exc)
    else:
        raise AssertionError("havia de fallar")
