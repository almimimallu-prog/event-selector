"""Esdeveniments de Gemini que duren uns quants dies: una sessió per dia, com fan els altres adaptadors."""

from datetime import datetime

from event_pipeline.config import TIMEZONE
from event_pipeline.models import ExtractedEvent
from event_pipeline.sources import item_from_extracted

SOURCE = {"default_city": "Barcelona", "url": "https://www.instagram.com/planesenbarcelona/"}
NOW = datetime(2026, 11, 12, 10, 0, tzinfo=TIMEZONE)


def _event(start, end=None, all_day=True, kind="session"):
    return ExtractedEvent(is_event=True, title="CheesyFest", start=start, end=end, all_day=all_day, kind=kind,
                          category="gastronomia_social", summary_ca="Festival del formatge", confidence=0.9)


def _days(items):
    return [datetime.fromisoformat(i["start"]).date().day for i in items]


def test_weekend_fair_becomes_one_session_per_day():
    items = item_from_extracted(_event(datetime(2026, 11, 13), datetime(2026, 11, 15, 23, 59)), SOURCE, NOW)
    assert _days(items) == [13, 14, 15]
    assert all(i["kind"] == "session" and i["all_day"] and i["end"] is None for i in items)
    assert len({i["external_id"] for i in items}) == 3
    assert len({i["series_key"] for i in items}) == 1 and items[0]["series_key"]


def test_first_day_keeps_the_same_external_id_as_before():
    """El primer dia ha de coincidir amb l'esdeveniment que ja hi havia (es reaprofita en lloc de duplicar-lo)."""
    single = item_from_extracted(_event(datetime(2026, 11, 13)), SOURCE, NOW)
    items = item_from_extracted(_event(datetime(2026, 11, 13), datetime(2026, 11, 15, 23, 59)), SOURCE, NOW)
    assert items[0]["external_id"] == single[0]["external_id"]


def test_daily_hours_are_kept_on_each_day():
    items = item_from_extracted(
        _event(datetime(2026, 11, 13, 10, 0), datetime(2026, 11, 14, 20, 0), all_day=False), SOURCE, NOW)
    assert [(i["start"][11:16], i["end"][11:16]) for i in items] == [("10:00", "20:00"), ("10:00", "20:00")]


def test_days_already_gone_are_skipped():
    now = datetime(2026, 11, 14, 15, 0, tzinfo=TIMEZONE)
    items = item_from_extracted(_event(datetime(2026, 11, 12), datetime(2026, 11, 15, 23, 59)), SOURCE, now)
    assert _days(items) == [14, 15]


def test_longer_than_a_week_goes_to_long_running():
    items = item_from_extracted(_event(datetime(2026, 11, 13), datetime(2026, 11, 29, 23, 59)), SOURCE, NOW)
    assert len(items) == 1 and items[0]["kind"] == "long_running" and items[0]["end"]


def test_overnight_concert_stays_a_single_session():
    items = item_from_extracted(
        _event(datetime(2026, 11, 14, 22, 0), datetime(2026, 11, 15, 2, 0), all_day=False), SOURCE, NOW)
    assert len(items) == 1 and items[0]["end"][:10] == "2026-11-15"


def test_not_an_event_gives_nothing():
    event = _event(datetime(2026, 11, 13)).model_copy(update={"is_event": False})
    assert item_from_extracted(event, SOURCE, NOW) == []
