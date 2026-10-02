"""Adaptadors genèrics (The Events Calendar, JSON-LD) i Diputació, amb dades reals simplificades."""

from datetime import date, time

from event_pipeline.adapters import diba, jsonld, tribe

TODAY = date(2026, 10, 2)
UNTIL = date(2026, 11, 30)


def tribe_event(**overrides):
    event = {
        "id": 101, "title": "Escumostra a Sant Sadurní d&#8217;Anoia", "start_date": "2026-10-03 00:00:00",
        "end_date": "2026-10-04 23:59:59", "all_day": True, "cost": "Gratuït",
        "url": "https://firescatalanes.cat/fires/escumostra/", "image": {"url": "https://img/escumostra.jpg"},
        "categories": [{"name": "Gastronòmica i alimentació"}],
        "venue": {"venue": "Sant Sadurní", "city": "Sant Sadurní d'Anoia", "geo_lat": 41.4262, "geo_lng": 1.7853},
        "excerpt": "<p>Mostra de caves.</p>",
    }
    event.update(overrides)
    return event


def test_tribe_weekend_fair_becomes_one_session_per_day():
    events = tribe.parse_events([tribe_event()], "fires", TODAY, UNTIL, "gastronomia_social")
    assert [e.start.date() for e in events] == [date(2026, 10, 3), date(2026, 10, 4)]
    first = events[0]
    assert first.title == "Escumostra a Sant Sadurní d’Anoia" and first.all_day and first.is_free
    assert first.category == "gastronomia_social" and first.series_key == "fires:101"
    assert first.description == "Mostra de caves." and first.image_url == "https://img/escumostra.jpg"


def test_tribe_timed_event_and_far_away_filter():
    timed = tribe_event(id=2, start_date="2026-10-10 18:00:00", end_date="2026-10-10 21:00:00", all_day=False)
    figueres = tribe_event(id=3, venue={"city": "Figueres", "geo_lat": 42.266, "geo_lng": 2.957})
    [event] = tribe.parse_events([timed, figueres], "fires", TODAY, UNTIL, "gastronomia_social")
    assert event.start.time() == time(18) and event.end.time() == time(21)


def test_tribe_venue_without_coordinates_uses_municipality():
    event = tribe_event(venue={"venue": "Plaça de Cal Font", "city": "Igualada"})
    events = tribe.parse_events([event], "fires", TODAY, UNTIL, "gastronomia_social")
    assert events and round(events[0].lat, 2) == 41.58


def test_jsonld_skips_online_and_treats_midnight_as_all_day():
    raw = [
        {"@type": "EducationEvent", "name": "MCP Meetup", "startDate": "2026-10-08T00:00:00.000+00:00",
         "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode"},
        {"@type": "Event", "name": "EuroRust 2026", "startDate": "2026-10-14T00:00:00.000+00:00",
         "endDate": "2026-10-15T00:00:00.000+00:00", "url": "https://dev.events/conferences/eurorust",
         "location": {"@type": "Place", "name": "Barcelona", "address": {"addressLocality": "Barcelona"}}},
        {"@type": "MusicEvent", "name": "Jazz al Jamboree", "startDate": "2026-10-20T19:30:00+02:00",
         "location": {"name": "Jamboree", "geo": {"latitude": 41.3797, "longitude": 2.1753}},
         "offers": {"price": "15"}},
    ]
    events = jsonld.parse_events(raw, "jsonld", TODAY, UNTIL, "formacio_tech")
    assert [e.title for e in events] == ["EuroRust 2026", "EuroRust 2026", "Jazz al Jamboree"]
    assert events[0].all_day and events[0].series_key
    jazz = events[2]
    assert not jazz.all_day and jazz.start.time() == time(19, 30) and jazz.price_min == 15
    assert jazz.category == "cultura"  # paraula clau "jazz", tot i que la font és de tecnologia


def test_diba_long_visits_are_long_running_and_tags_give_category():
    raw = [{
        "acte_id": "agendaturisme1", "titol": "Visita guiada a la Fassina Arbolí", "data_inici": "2026-09-06 00:00:00",
        "data_fi": "2026-12-13 23:59:59", "descripcio": "Visita a l'antiga destil·leria.",
        "grup_adreca": {"adreca_nom": "Fassina", "municipi_nom": "L'Hospitalet", "localitzacio": "41.3596,2.0997"},
        "tags": ["000. NO MOSTRAR FORMULARI", "Visites guiades", "L'Hospitalet"], "acte_url": "https://x",
    }, {
        "acte_id": "agendaturisme2", "titol": "Ruta pels camins de ronda", "data_inici": "2026-10-11 00:00:00",
        "data_fi": "2026-10-11 23:59:59", "grup_adreca": {"municipi_nom": "Igualada", "localitzacio": "41.578,1.617"},
        "tags": ["Natura"],
    }]
    visit, route = diba.parse_events(raw, "actesturisme_ca", TODAY, UNTIL, "cultura")
    assert visit.kind == "long_running" and visit.tags == ["visites guiades"]
    assert route.kind == "session" and route.all_day and route.category == "esport_natura"
