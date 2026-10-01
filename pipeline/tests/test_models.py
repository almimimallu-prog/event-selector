from datetime import datetime

import pytest
from pydantic import ValidationError

from event_pipeline.config import TIMEZONE
from event_pipeline.models import ExtractedEvent, ExtractionResult

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=TIMEZONE)


def make(**overrides):
    data = {
        "is_event": True,
        "title": "Jazz a l'Aurora",
        "start": "2026-10-10T20:30:00",
        "venue_name": "Teatre de l'Aurora",
        "city": "Igualada",
        "category": "cultura",
        "summary_ca": "Trio de jazz manouche.",
        "confidence": 0.9,
    }
    data.update(overrides)
    return ExtractedEvent.model_validate(data)


def test_naive_dates_are_local_time():
    assert make().start.tzinfo == TIMEZONE


def test_valid_event_has_no_problems():
    assert make().problems(NOW) == []


@pytest.mark.parametrize(
    ("overrides", "problem"),
    [
        ({"is_event": False}, "no és un esdeveniment"),
        ({"start": "2026-09-20T20:00:00"}, "ja ha passat"),
        ({"start": "2029-01-01T20:00:00"}, "data massa llunyana"),
        ({"confidence": 0.4}, "confiança baixa"),
        ({"venue_name": None, "city": None}, "sense lloc"),
    ],
)
def test_problems_send_event_to_review(overrides, problem):
    assert problem in make(**overrides).problems(NOW)


def test_end_before_start_is_rejected():
    with pytest.raises(ValidationError):
        make(end="2026-10-10T19:00:00")


def test_unknown_category_is_rejected():
    with pytest.raises(ValidationError):
        make(category="musica")


def test_result_accepts_several_events():
    result = ExtractionResult.model_validate({"events": [make().model_dump(), make(title="Altre").model_dump()]})
    assert len(result.events) == 2
