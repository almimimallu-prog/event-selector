from datetime import date, datetime

from event_pipeline.adapters import ics
from event_pipeline.config import TIMEZONE

TODAY, UNTIL = date(2026, 10, 3), date(2026, 12, 1)

CALENDAR = """BEGIN:VCALENDAR\r
X-WR-CALNAME:BarcelonaJS\r
BEGIN:VEVENT\r
UID:event_1@meetup.com\r
DTSTART;TZID=Europe/Madrid:20261007T183000\r
DTEND;TZID=Europe/Madrid:20261007T213000\r
SUMMARY:BarcelonaJS x Enginy\\, Meetup\r
DESCRIPTION:Xerrades sobre IA\\nAmb pizza i una línia molt llarga que conti\r
 nua aquí\r
LOCATION:Enginy (Carrer de Pujades 77\\, Barcelona)\r
URL;VALUE=URI:https://www.meetup.com/barcelonajs/events/1/\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:event_2@meetup.com\r
DTSTART:20261008T170000Z\r
SUMMARY:Online meetup\r
LOCATION:Online event\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:event_3@meetup.com\r
DTSTART;VALUE=DATE:20261010\r
DTEND;VALUE=DATE:20261012\r
SUMMARY:Fira de tardor\r
LOCATION:Plaça de Cal Font\\, Igualada\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:event_4@meetup.com\r
DTSTART:20261009T170000Z\r
SUMMARY:Lluny\r
LOCATION:Girona\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:event_5@meetup.com\r
DTSTART:20261009T170000Z\r
SUMMARY:Cancel·lat\r
STATUS:CANCELLED\r
END:VEVENT\r
END:VCALENDAR\r
"""


def test_meetup_ical_url():
    assert ics.meetup_ical_url("https://www.meetup.com/barcelonajs/") == "https://www.meetup.com/barcelonajs/events/ical/"
    assert ics.meetup_ical_url("https://www.meetup.com/es-ES/barcelonajs/events/316793592/") == \
        "https://www.meetup.com/barcelonajs/events/ical/"
    assert ics.meetup_ical_url("https://www.meetup.com/find/?location=es--Barcelona") is None


def test_parse_events():
    events = ics.parse_events(CALENDAR, "ics", TODAY, UNTIL, "cultura")
    by_title = {}
    for e in events:
        by_title.setdefault(e.title, []).append(e)
    assert set(by_title) == {"BarcelonaJS x Enginy, Meetup", "Fira de tardor"}  # sense online, lluny ni cancel·lat
    talk = by_title["BarcelonaJS x Enginy, Meetup"][0]
    assert talk.start == datetime(2026, 10, 7, 18, 30, tzinfo=TIMEZONE)
    assert talk.end == datetime(2026, 10, 7, 21, 30, tzinfo=TIMEZONE)
    assert talk.city == "Barcelona" and talk.venue_name == "Enginy"
    assert talk.description.startswith("Xerrades sobre IA\nAmb pizza") and "continua aquí" in talk.description
    assert talk.url == "https://www.meetup.com/barcelonajs/events/1/"
    fair = by_title["Fira de tardor"]
    # DTEND d'un dia sencer és exclusiu: 10 i 11 d'octubre
    assert [e.start.date() for e in fair] == [date(2026, 10, 10), date(2026, 10, 11)]
    assert all(e.all_day and e.city == "Igualada" for e in fair)


def test_default_city_when_no_location():
    text = "BEGIN:VEVENT\nUID:x\nDTSTART:20261009T170000Z\nSUMMARY:Trobada\nEND:VEVENT\n"
    [event] = ics.parse_events(text, "ics", TODAY, UNTIL, "cultura", default_city="Igualada")
    assert event.city == "Igualada" and event.start.hour == 19  # 17:00 UTC → 19:00 a Catalunya


def test_skips_online_and_other_cities_by_title():
    text = "".join(f"BEGIN:VEVENT\nUID:{i}\nDTSTART:20261009T170000Z\nSUMMARY:{t}\nEND:VEVENT\n" for i, t in enumerate([
        "Public Speaking with Business Speakers TM (On-site Meeting) - Lisbon",
        "Improve Public Speaking During Lunch! (Online)",
        "Toastmasters Mijas | Improve Your Public Speaking Skills!",
        "Oratoria y liderazgo | Mediterranea Toastmasters Barcelona",
    ]))
    events = ics.parse_events(text, "ics", TODAY, UNTIL, "formacio_tech", default_city="Barcelona")
    assert [e.title for e in events] == ["Oratoria y liderazgo | Mediterranea Toastmasters Barcelona"]
