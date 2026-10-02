"""Adaptadors amb files reals (simplificades) de les fonts, sense xarxa."""

from datetime import date, time

from event_pipeline.adapters import bcn, gencat

TODAY = date(2026, 10, 2)
UNTIL = date(2026, 10, 16)
IGUALADA = {"latitud": "41.5800", "longitud": "1.6170"}


def gencat_row(**overrides):
    row = {
        "codi": "20261001001",
        "denominaci": "Göteborg",
        "data_inici": "2026-10-11T00:00:00.000",
        "data_fi": "2026-10-11T00:00:00.000",
        "horari": "18 h Durada aproximada: 90 minuts.",
        "gratuita": "No",
        "entrades": "Preu: 22 €",
        "linkbotoentrades": "https://teatreaurora.cat/entrades",
        "imatges": "/content/dam/agenda/ca/activitats/2026/goteborg 1.jpg",
        "espai": "Teatre de l'Aurora",
        "municipi": "agenda:ubicacions/barcelona/anoia/igualada",
        "tags_categor_es": "agenda:categories/teatre",
        **IGUALADA,
    }
    row.update(overrides)
    return row


def test_gencat_single_day_event():
    [event] = gencat.parse_rows([gencat_row()], TODAY, UNTIL)
    assert event.external_id == "gencat:20261001001:teatre-de-l-aurora"
    assert event.start.time() == time(18) and event.end.time() == time(19, 30)
    assert event.city == "Igualada"
    assert event.price_min == 22 and event.is_free is False
    assert event.image_url == "https://agenda.cultura.gencat.cat/content/dam/agenda/ca/activitats/2026/goteborg%201.jpg"
    assert event.category == "cultura"


def test_gencat_short_festival_becomes_daily_sessions():
    row = gencat_row(data_inici="2026-10-03T00:00:00.000", data_fi="2026-10-04T00:00:00.000", horari="10.30 h")
    events = gencat.parse_rows([row], TODAY, UNTIL)
    assert [e.start.date() for e in events] == [date(2026, 10, 3), date(2026, 10, 4)]
    assert {e.series_key for e in events} == {"gencat:20261001001:teatre-de-l-aurora"}
    assert len({e.external_id for e in events}) == 2


def test_gencat_same_code_in_several_venues_are_different_events():
    apolo = gencat_row(espai="Sala Apolo", latitud="41.3744", longitud="2.1699")
    razz = gencat_row(espai="Razzmatazz", latitud="41.3977", longitud="2.1912")
    ids = [e.external_id for e in gencat.parse_rows([apolo, razz], TODAY, UNTIL)]
    assert ids == ["gencat:20261001001:sala-apolo", "gencat:20261001001:razzmatazz"]


def test_gencat_long_and_permanent_activities_are_long_running():
    expo = gencat_row(data_inici="2026-05-17T00:00:00.000", data_fi="2026-12-13T00:00:00.000")
    permanent = gencat_row(codi="2", data_fi="9999-09-09T00:00:00.000", permanent="Sí")
    events = gencat.parse_rows([expo, permanent], TODAY, UNTIL)
    assert all(e.kind == "long_running" and e.all_day for e in events)
    assert events[1].end is None


def test_gencat_filters_outside_zones_and_past():
    far = gencat_row(latitud="41.98", longitud="2.82")  # Girona
    past = gencat_row(data_inici="2026-09-20T00:00:00.000", data_fi="2026-09-20T00:00:00.000")
    assert gencat.parse_rows([far, past], TODAY, UNTIL) == []


def test_gencat_free_flag():
    [event] = gencat.parse_rows([gencat_row(gratuita="Sí", entrades="")], TODAY, UNTIL)
    assert event.is_free and event.price_min == 0


TIMETABLE_WEEKLY = (
    '<table class="timetable-table"><tr class="timetable-header"><th>Dies</th><th>Hores</th><th>Preus</th>'
    '<th>Observacions</th></tr><tr><td class="timetable-day" rowspan=2><div>Dilluns excepte 12 octubre</div></td>'
    '<td class="timetable-hour" rowspan=1><div>de 10.30&nbsp;h a 12.00&nbsp;h</div></td>'
    '<td class="timetable-price" rowspan=2><div>Entrada general: 85.85 € <p>Reducció i subvenció dels imports'
    '</p><p>Cal inscripció prèvia.</p></div></td><td class="timetable-description" rowspan=1><div>Grup A</div></td>'
    '</tr><tr><td class="timetable-hour" rowspan=1><div>de 12.00&nbsp;h a 13.30&nbsp;h</div></td>'
    '<td class="timetable-description" rowspan=1><div>Grup B</div></td></tr></table>'
)


def bcn_row(**overrides):
    row = {
        "register_id": "99001",
        "name": "Concert \"Estacions - Trio Ether\"",
        "institution_name": "",
        "addresses_road_name": "Carrer de Sicília",
        "addresses_start_street_number": "321",
        "addresses_town": "BARCELONA",
        "geo_epgs_4326_lat": "41.4030",
        "geo_epgs_4326_lon": "2.1740",
        "start_date": "2026-10-02T03:00:00+02:00",
        "end_date": "2026-10-02T03:00:00+02:00",
        "timetable": (
            '<table><tr class="timetable-header"><th>Dies</th></tr><tr><td class="timetable-day"><div>Divendres</div>'
            '</td><td class="timetable-hour"><div>a les 19.00&nbsp;h</div></td><td class="timetable-price">'
            '<div>Entrada Gratuïta</div></td></tr></table>'
        ),
        "values_attribute_name": "",
        "values_value": "",
    }
    row.update(overrides)
    return row


def test_timetable_rowspan_keeps_columns_aligned():
    rows = bcn.timetable_rows(TIMETABLE_WEEKLY)
    assert [r["hours"] for r in rows] == ["de 10.30 h a 12.00 h", "de 12.00 h a 13.30 h"]
    assert rows[1]["days"] == "Dilluns excepte 12 octubre"
    assert rows[1]["price"].startswith("Entrada general: 85.85 €")
    assert rows[1]["notes"] == "Grup B"


def test_bcn_single_event():
    [event] = bcn.parse_rows([bcn_row()], TODAY, UNTIL)
    assert event.start.time() == time(19) and event.is_free
    assert event.city == "Barcelona" and event.address == "Carrer de Sicília 321"
    assert event.category == "cultura" and not event.category_guessed


def test_bcn_weekly_course_is_one_course_card():
    row = bcn_row(name="Taller 'Hipoestiraments'", start_date="2026-09-28T03:00:00+02:00",
                  end_date="2026-12-14T03:00:00+01:00", timetable=TIMETABLE_WEEKLY)
    [event] = bcn.parse_rows([row], TODAY, UNTIL)
    assert event.kind == "course" and event.external_id == "bcn:99001" and event.series_key is None
    assert event.start.date() == date(2026, 10, 5) and event.start.time() == time(10, 30)  # propera sessió
    assert event.end.date() == date(2026, 12, 14)  # últim dia del curs
    assert event.schedule_text == "Dilluns excepte 12 octubre de 10.30 h a 12.00 h · "         "Dilluns excepte 12 octubre de 12.00 h a 13.30 h (fins al 14/12)"
    assert event.price_min == 85.85 and event.price_text == "Entrada general: 85.85 €"
    assert "inscripció prèvia" in event.tags


def test_bcn_short_weekly_cycle_stays_as_sessions():
    row = bcn_row(name="Cicle de cinema", start_date="2026-10-02T03:00:00+02:00",
                  end_date="2026-10-16T03:00:00+02:00")  # divendres 2, 9 i 16
    events = bcn.parse_rows([row], TODAY, UNTIL)
    assert [e.start.day for e in events] == [2, 9, 16]
    assert {e.kind for e in events} == {"session"} and {e.series_key for e in events} == {"bcn:99001"}


def test_bcn_exhibition_with_opening_hours_is_long_running():
    hours = "".join(
        f'<tr><td class="timetable-day"><div>{d}</div></td><td class="timetable-hour"><div>de 9 a 20 h</div></td></tr>'
        for d in ("Dilluns", "Dimarts", "Dimecres", "Dijous", "Divendres")
    )
    row = bcn_row(name="Exposició 'Paisatges perduts'", start_date="2026-09-01T03:00:00+02:00",
                  end_date="2026-11-30T03:00:00+01:00", timetable=f"<table>{hours}</table>")
    [event] = bcn.parse_rows([row], TODAY, UNTIL)
    assert event.kind == "long_running" and event.all_day


def test_bcn_reads_utf16_csv_and_strips_bom_from_values():
    content = "register_id,name\r\n﻿1,Concert\r\n".encode("utf-16")
    assert bcn.parse_csv(content) == [{"register_id": "1", "name": "Concert"}]
