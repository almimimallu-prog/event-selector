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


def test_social_and_dating_examples():
    """Exemples reals (diumenge 4 d'octubre de 2026) que sortien com a cultura."""
    from event_pipeline.categories import classify

    cases = {
        "FIRST DATES EXPRESS (25-35; 36-47) in Barcelona at ALICE SECRET GARDEN": "dating",
        "FIRST MATCH SUNDAY DATES +40 in Sabadell at SOCA BOTA": "dating",
        "\"Amor a primera vista!\" en català a Alice Secret Garden": "dating",
        "BREAKFAST (BUFFET LIBRE)🌮": "gastronomia_social",
        "PIRATE BOAT EXPERIENCE 🏴‍☠️⛵ Barcelona Coast + Unlimited Drinks": "gastronomia_social",
        "♟️ Chess Night @Trafalgar Pizza Club": "gastronomia_social",
        "WEREWOLVES @Trafalgar Pizza Club": "gastronomia_social",
        "OKTOBERFEST PARTY 🍺🥨 & FREE SALSA-BACHATA CLASS 💃 + FREE SHOT WITH 0.5L BEER": "gastronomia_social",
        "SUNDAY VIBES & HAPPY HOUR + STAND UP COMMEDY & LIVE MUSIC": "gastronomia_social",
        "Caminata desde Port Vendres y la fiesta del vino en Banyuls-Sur-Mer": "esport_natura",
        "BCN FinTech X Barcinno: Blockchain, DeFi & Crypto in Fintech": "formacio_tech",
        "Cineforum - Sessió de tardor": "cultura",
    }
    for title, want in cases.items():
        assert classify(title) == want, title


def test_source_default_beats_description():
    from event_pipeline.categories import classify

    description = "Grab a beer and a snack. Networking and drinks after the talks."
    assert classify("BarcelonaJS x Enginy Meetup", description, default="formacio_tech") == "formacio_tech"
    assert classify("BarcelonaJS x Enginy Meetup", description) == "gastronomia_social"  # sense categoria de font
