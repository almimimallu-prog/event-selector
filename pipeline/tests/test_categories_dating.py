from event_pipeline.categories import from_keywords


def test_dating_keywords():
    for title in ["Speed Dating Barcelona 30-45", "Festa per a solters", "Singles Night", "Citas rápidas en Gràcia",
                  "Cites ràpides a Igualada", "Trobada de solteres", "Single party al Raval"]:
        assert from_keywords(title) == "dating", title


def test_not_dating():
    assert from_keywords("Single malt whisky tasting") != "dating"
    assert from_keywords("Ball en parella") == "gastronomia_social"
    assert from_keywords("Meetup de Python") == "formacio_tech"
    assert from_keywords("Consolidating data pipelines") is None
