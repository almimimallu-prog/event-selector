from datetime import datetime

from event_pipeline.config import TIMEZONE
from event_pipeline.models import ExtractedEvent
from event_pipeline.sources import item_from_extracted

NOW = datetime(2026, 10, 3, 10, 0, tzinfo=TIMEZONE)


def _event():
    return ExtractedEvent(is_event=True, title="Concert íntim", start=datetime(2026, 10, 10, 21, 0),
                          category="cultura", summary_ca="Concert", confidence=0.9)


def test_source_city_avoids_review():
    item = item_from_extracted(_event(), {"default_city": "Igualada", "url": "https://x"}, NOW)
    assert item["status"] == "published" and item["city"] == "Igualada"


def test_without_any_place_goes_to_review():
    item = item_from_extracted(_event(), {"url": "https://x"}, NOW)
    assert item["status"] == "review" and "sense lloc" in item["review_reasons"]
