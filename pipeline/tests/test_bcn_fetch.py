"""Agenda de Barcelona: lectura per l'API del portal (datastore), amb el CSV de reserva.

Des de GitHub Actions, la descàrrega del CSV respon 403 des del 23/10/2026; l'API del mateix portal dona les mateixes
files i columnes.
"""

import httpx

from event_pipeline.adapters import bcn

RECORDS = [{"_id": i, "register_id": 100 + i, "name": f"Activitat {i}", "geo_epgs_4326_lat": 41.38,
            "start_date": "2026-11-20T00:00:00", "end_date": None} for i in range(5)]
RECORDS[1]["register_id"] = "﻿101"  # com algunes files reals: BOM enganxat a l'identificador


def _client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_fetch_reads_every_page_of_the_api_as_csv_like_rows(monkeypatch):
    monkeypatch.setattr(bcn, "PAGE_SIZE", 2)
    offsets = []

    def handler(request):
        assert request.url.path.endswith("/datastore_search")
        assert request.url.params["resource_id"] == bcn.RESOURCE_ID
        offset, limit = int(request.url.params["offset"]), int(request.url.params["limit"])
        offsets.append(offset)
        return httpx.Response(200, json={"success": True, "result": {
            "total": len(RECORDS), "records": RECORDS[offset:offset + limit]}})

    with _client(handler) as client:
        rows = bcn.fetch(client)
    assert offsets == [0, 2, 4]
    # Com les files del CSV: tot text, sense _id, i els buits com a cadena buida.
    assert rows[0] == {"register_id": "100", "name": "Activitat 0", "geo_epgs_4326_lat": "41.38",
                       "start_date": "2026-11-20T00:00:00", "end_date": ""}
    assert len(rows) == 5 and rows[1]["register_id"] == "101"


def test_fetch_falls_back_to_the_csv_when_the_api_fails():
    csv = "register_id,name\n1,Concert\n".encode("utf-8")

    def handler(request):
        if request.url.path.endswith("/datastore_search"):
            return httpx.Response(403, text="Forbidden")
        return httpx.Response(200, content=csv)

    with _client(handler) as client:
        assert bcn.fetch(client) == [{"register_id": "1", "name": "Concert"}]
