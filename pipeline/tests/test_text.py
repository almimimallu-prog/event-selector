from datetime import date, time

import pytest

from event_pipeline.categories import from_gencat_tags, from_keywords
from event_pipeline.text import is_excluded, parse_duration_minutes, parse_price, parse_times, parse_weekdays


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("18 h", [(time(18), None)]),
        ("17.30 h", [(time(17, 30), None)]),
        ("A les 18 h", [(time(18), None)]),
        ("a les 19.00 h i a les 21.00 h", [(time(19), None), (time(21), None)]),
        ("de 17.00 h a 19.00 h", [(time(17), time(19))]),
        ("d'11.00 h a 13.00 h", [(time(11), time(13))]),
        ("de 10 a 14 h", [(time(10), time(14))]),
        ("de 10:30 h a 12:00 h i de 17.00 h a 19.00 h", [(time(10, 30), time(12)), (time(17), time(19))]),
        ("16 h Durada aproximada: 1 h 30 min", [(time(16), None)]),  # la durada no és una hora
        ("Horari no definit", []),
        ("", []),
    ],
)
def test_parse_times(text, expected):
    assert parse_times(text) == expected


@pytest.mark.parametrize(
    ("text", "minutes"),
    [
        ("16 h Durada aproximada: 55 minuts.", 55),
        ("18 h Durada aproximada: 1 hora i 30 minuts", 90),
        ("20 h Durada aproximada: 1 h 15 min.", 75),
        ("18 h", None),
    ],
)
def test_parse_duration(text, minutes):
    assert parse_duration_minutes(text) == minutes


@pytest.mark.parametrize(
    ("text", "price_min", "is_free"),
    [
        ("Preu: 22 €", 22.0, False),
        ("Entrada Gratuïta", 0.0, True),
        ("Entrada general: 125.91 €", 125.91, False),
        ("Entrada general de: 10 a 15 €", 10.0, False),
        ("Preus: de 24 a 18 € (segons zona)", 18.0, False),
        ("Taquilla inversa", None, None),
        ("", None, None),
    ],
)
def test_parse_price(text, price_min, is_free):
    assert parse_price(text)[:2] == (price_min, is_free)


@pytest.mark.parametrize(
    ("label", "days"),
    [
        ("Dijous", {3}),
        ("Dimarts i dijous", {1, 3}),
        ("Dilluns, dimecres, dijous i divendres", {0, 2, 3, 4}),
        ("De dilluns a divendres", {0, 1, 2, 3, 4}),
        ("De dimarts a dissabtes", {1, 2, 3, 4, 5}),
        ("Cada dia", set(range(7))),
        ("Diumenge i festius", {6}),
        ("de 19.00 h a 20.00 h", set()),
    ],
)
def test_parse_weekdays(label, days):
    assert parse_weekdays(label)[0] == days


def test_weekday_exceptions():
    days, excluded = parse_weekdays("Dilluns excepte 12 octubre i 7 desembre")
    assert days == {0}
    assert is_excluded(date(2026, 10, 12), excluded)
    assert is_excluded(date(2026, 12, 7), excluded)
    assert not is_excluded(date(2026, 10, 19), excluded)


@pytest.mark.parametrize(
    ("title", "category"),
    [
        ("Taller 'Muntem un forn solar'", "formacio_tech"),
        ("Xerrada sobre energia", "formacio_tech"),
        ("Ruta pels camins de ronda", "esport_natura"),
        ("Fira del vi de l'Anoia", "gastronomia_social"),
        ("Concert 'Estacions - Trio Ether'", "cultura"),
        ("Exposició \"Viure l'espai públic: festa i activisme\"", "cultura"),  # exposició guanya a "festa"
        ("Visita guiada: Cerdanyola, terra d'ibers", "cultura"),
        ("Sense pistes", None),
    ],
)
def test_keywords(title, category):
    assert from_keywords(title) == category


def test_gencat_tags_ignore_ambiguous_routes():
    assert from_gencat_tags("agenda:categories/conferencies") == "formacio_tech"
    assert from_gencat_tags("agenda:categories/rutes-i-visites") is None
