"""Neteja d'HTML, JSON-LD i client de Gemini amb respostes simulades (sense xarxa ni quota)."""

import json
from datetime import datetime

import httpx
import pytest

from event_pipeline import gemini
from event_pipeline.clean import html_to_text, json_ld_events
from event_pipeline.config import TIMEZONE
from event_pipeline.extract import SourceContext, build_prompt, extract

NOW = datetime(2026, 10, 2, 16, 0, tzinfo=TIMEZONE)

PAGE = """<html><head><script type="application/ld+json">
{"@context": "https://schema.org", "@graph": [
  {"@type": "WebPage", "name": "Agenda"},
  {"@type": "MusicEvent", "name": "Jazz a l'Aurora", "startDate": "2026-10-10T20:30"}]}
</script></head><body>
<header><nav><a href="/">Inici</a></nav></header>
<div class="cmplz-cookiebanner">Acceptar galetes</div>
<h2>octubre 2026</h2>
<article><a href="/esdeveniment/montigual/">Montigual</a><p>Data: 11, oct. 2026</p>
<img src="/img/montigual.jpg"><img src="/img/logo.png"></article>
<script>var x = 1;</script><footer>Avís legal</footer></body></html>"""


def test_html_to_text_keeps_content_and_links_and_drops_noise():
    text = html_to_text(PAGE, "https://igualadaturisme.com/agenda/")
    assert "[Montigual](https://igualadaturisme.com/esdeveniment/montigual/)" in text
    assert "Data: 11, oct. 2026" in text
    assert "![](https://igualadaturisme.com/img/montigual.jpg)" in text
    for noise in ("Inici", "galetes", "var x", "Avís legal", "logo.png"):
        assert noise not in text


def test_json_ld_finds_event_subtypes_inside_graph():
    [event] = json_ld_events(PAGE)
    assert event["name"] == "Jazz a l'Aurora"


def test_prompt_has_today_and_source_defaults():
    prompt = build_prompt("contingut", SourceContext("Teatre", "https://t.cat", "Igualada", "Teatre de l'Aurora"), NOW)
    assert "TODAY: 2026-10-02 (Friday) 16:00" in prompt
    assert "DEFAULT CITY (if the content does not say otherwise): Igualada" in prompt
    assert "DEFAULT VENUE (if the content does not say otherwise): Teatre de l'Aurora" in prompt


def gemini_response(events: list[dict]) -> httpx.Response:
    return httpx.Response(200, json={
        "candidates": [{"content": {"parts": [{"text": json.dumps({"events": events})}]}}],
        "usageMetadata": {"promptTokenCount": 100, "candidatesTokenCount": 50},
        "modelVersion": "gemini-test",
    })


EVENT = {"is_event": True, "title": "Montigual", "start": "2026-10-11T00:00:00", "all_day": True,
         "city": "Igualada", "category": "esport_natura", "summary_ca": "Ruta senderista.", "confidence": 0.9}


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(gemini.time, "sleep", lambda s: None)


def run(handler, **kwargs):
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        return extract(client, "clau", "contingut", SourceContext("Font"), NOW, **kwargs)


def test_extract_validates_events_and_reports_usage():
    seen = {}

    def handler(request):
        seen["key"] = request.headers["x-goog-api-key"]
        seen["body"] = json.loads(request.content)
        return gemini_response([EVENT])

    result, usage = run(handler)
    assert [e.title for e in result.events] == ["Montigual"]
    assert result.events[0].start.tzinfo == TIMEZONE
    assert (usage.input_tokens, usage.output_tokens) == (100, 50)
    assert seen["key"] == "clau"  # la clau va a la capçalera, no a la URL
    assert seen["body"]["generationConfig"]["responseJsonSchema"]["properties"]["events"]


def test_invalid_items_are_dropped_but_valid_ones_kept():
    broken = {**EVENT, "title": "X", "category": "música"}  # títol massa curt i categoria inexistent
    result, _ = run(lambda request: gemini_response([broken, EVENT]))
    assert [e.title for e in result.events] == ["Montigual"]


def test_overloaded_model_is_retried_then_fallback_used():
    calls = []

    def handler(request):
        model = request.url.path.split("/")[-1].split(":")[0]
        calls.append(model)
        if model == gemini.DEFAULT_MODEL:
            return httpx.Response(503, json={"error": {"status": "UNAVAILABLE"}})
        return gemini_response([EVENT])

    result, _ = run(handler)
    assert calls == [gemini.DEFAULT_MODEL] * 3 + [gemini.DEFAULT_FALLBACK_MODEL]
    assert len(result.events) == 1


def test_quota_exhausted_on_all_models_raises():
    with pytest.raises(gemini.QuotaExceeded):
        run(lambda request: httpx.Response(429, json={"error": {"status": "RESOURCE_EXHAUSTED"}}))


def test_bad_request_is_not_retried():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(400, json={"error": {"message": "schema invàlid"}})

    with pytest.raises(gemini.GeminiError):
        run(handler)
    assert len(calls) == 1
