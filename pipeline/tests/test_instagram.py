from datetime import datetime, timedelta

from event_pipeline import run
from event_pipeline.adapters import instagram
from event_pipeline.config import TIMEZONE
from event_pipeline.gemini import Usage
from event_pipeline.models import ExtractedEvent, ExtractionResult

NOW = datetime(2026, 10, 3, 10, 0, tzinfo=TIMEZONE)


def test_parse_handle():
    assert instagram.parse_handle("@TeatreAurora") == "teatreaurora"
    assert instagram.parse_handle("https://www.instagram.com/ebf_igualada/?hl=ca") == "ebf_igualada"
    assert instagram.parse_handle("mmp_capellades") == "mmp_capellades"
    assert instagram.parse_handle("https://www.instagram.com/p/ABC123/") is None
    assert instagram.parse_handle("no és un compte") is None


def test_parse_post_images():
    carousel = instagram.parse_post({
        "id": "1", "caption": " Concert ", "media_type": "CAROUSEL_ALBUM", "permalink": "https://instagram.com/p/x",
        "timestamp": "2026-10-01T18:30:00+0000",
        "children": {"data": [{"media_type": "IMAGE", "media_url": "a"}, {"media_type": "VIDEO", "media_url": "v"},
                              {"media_type": "IMAGE", "media_url": "b"}, {"media_type": "IMAGE", "media_url": "c"}]},
    })
    assert carousel.caption == "Concert" and carousel.image_urls == ["a", "b"]
    video = instagram.parse_post({"id": "2", "media_type": "VIDEO", "thumbnail_url": "t",
                                  "timestamp": "2026-10-01T18:30:00+0000"})
    assert video.image_urls == ["t"] and video.caption == ""
    assert instagram.parse_post({"id": "3"}) is None


def test_posts_prompt_mentions_permalink_and_warns_about_dates():
    post = instagram.Post("1", "Dissabte concert", "https://instagram.com/p/x", NOW, ["a"])
    text = instagram.posts_prompt([post])
    assert "detail_url: https://instagram.com/p/x" in text and "NOT the event date" in text


class FakeStore:
    def __init__(self, seen=()):
        self.seen, self.inserted, self.usage = set(seen), [], []

    def select(self, table, **params):
        if table == "raw_items":
            return [{"external_id": s} for s in self.seen]
        return []

    def insert(self, table, rows, on_conflict=None):
        self.inserted.append((table, rows))
        return rows

    def rpc(self, *a, **k):
        return None


class Settings:
    gemini_api_key = "k"


def _post(i, days_ago):
    return instagram.Post(str(i), f"post {i}", f"https://instagram.com/p/{i}", NOW - timedelta(days=days_ago), [])


def test_collect_instagram_only_new_recent_posts(monkeypatch):
    monkeypatch.setenv("INSTAGRAM_TOKEN", "t")
    monkeypatch.setenv("INSTAGRAM_USER_ID", "1")
    monkeypatch.setattr(instagram, "fetch_posts", lambda *a, **k: [_post(1, 1), _post(2, 3), _post(3, 60)])
    prompts = []

    def fake_extract(client, key, content, context, now, attachments=()):
        prompts.append(content)
        event = ExtractedEvent(is_event=True, title="Concert de tardor", start=datetime(2026, 10, 10, 21, 0),
                               category="cultura", summary_ca="Concert", confidence=0.9,
                               detail_url="https://instagram.com/p/1")
        return ExtractionResult(events=[event]), Usage("m", 1, 1)

    monkeypatch.setattr(run, "extract", fake_extract)
    monkeypatch.setattr(run, "record_llm_usage", lambda store, usage: None)
    store = FakeStore(seen={"post:2"})
    source = {"id": "s", "name": "Instagram: @teatreaurora", "handle": "teatreaurora",
              "url": "https://www.instagram.com/teatreaurora/", "default_city": "Igualada"}
    items, calls = run.collect_instagram(source, None, store, Settings(), NOW)
    assert calls == 1 and len(items) == 1
    assert items[0]["url"] == "https://instagram.com/p/1" and items[0]["city"] == "Igualada"
    assert "post 1" in prompts[0] and "post 2" not in prompts[0] and "post 3" not in prompts[0]
    [(table, rows)] = store.inserted
    assert table == "raw_items" and [r["external_id"] for r in rows] == ["post:1"]


def test_collect_instagram_nothing_new(monkeypatch):
    monkeypatch.setenv("INSTAGRAM_TOKEN", "t")
    monkeypatch.setenv("INSTAGRAM_USER_ID", "1")
    monkeypatch.setattr(instagram, "fetch_posts", lambda *a, **k: [_post(1, 1)])
    monkeypatch.setattr(run, "extract", lambda *a, **k: (_ for _ in ()).throw(AssertionError("no cal Gemini")))
    source = {"id": "s", "name": "x", "handle": "x"}
    assert run.collect_instagram(source, None, FakeStore(seen={"post:1"}), Settings(), NOW) == (None, 0)
