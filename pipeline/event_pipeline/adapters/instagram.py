"""Instagram via l'API oficial de Meta ("Business Discovery").

Permet llegir les publicacions públiques de comptes professionals (empresa o creador) a partir del compte
professional de l'usuari. No es fa scraping del web d'Instagram (les condicions d'ús ho prohibeixen).
Les publicacions no tenen dades estructurades: Gemini llegeix el text i el cartell (imatge).

Variables: INSTAGRAM_TOKEN (token d'accés de Meta), INSTAGRAM_USER_ID (id del compte professional propi).
"""

import os
import re
from dataclasses import dataclass
from datetime import datetime

import httpx

GRAPH = "https://graph.facebook.com/{version}"
DEFAULT_VERSION = "v25.0"
MEDIA_FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url}"


class InstagramError(Exception):
    pass


@dataclass
class Post:
    id: str
    caption: str
    permalink: str
    timestamp: datetime
    image_urls: list[str]


def graph_url(path: str) -> str:
    return f"{GRAPH.format(version=os.getenv('INSTAGRAM_GRAPH_VERSION') or DEFAULT_VERSION)}/{path.lstrip('/')}"


def parse_handle(text: str) -> str | None:
    """'@teatreaurora', 'teatreaurora' o 'https://www.instagram.com/teatreaurora/' → 'teatreaurora'."""
    text = text.strip()
    m = re.search(r"instagram\.com/([A-Za-z0-9_.]+)", text) or re.fullmatch(r"@?([A-Za-z0-9_.]{1,30})", text)
    if not m or m[1] in ("p", "reel", "reels", "stories", "explore"):
        return None
    return m[1].lower()


def _get(client: httpx.Client, token: str, path: str, **params) -> dict:
    response = client.get(graph_url(path), params=params, headers={"Authorization": f"Bearer {token}"}, timeout=60)
    if response.status_code >= 400:
        try:
            error = response.json().get("error", {})
        except ValueError:
            error = {}
        message = error.get("error_user_msg") or error.get("message") or response.text[:300]
        if error.get("code") == 190:
            raise InstagramError(f"El token d'Instagram ha caducat o no és vàlid: torna a fer instagram-setup ({message})")
        raise InstagramError(f"Meta {response.status_code}: {message}")
    return response.json()


def fetch_posts(client: httpx.Client, token: str, ig_user_id: str, handle: str, limit: int = 12) -> list[Post]:
    """Darreres publicacions d'un compte professional, de més noves a més antigues."""
    fields = f"business_discovery.username({handle}){{media.limit({limit}){{{MEDIA_FIELDS}}}}}"
    try:
        data = _get(client, token, ig_user_id, fields=fields)
    except InstagramError as exc:
        if "business_discovery" in str(exc).lower() or "cannot be found" in str(exc).lower() or "(#110)" in str(exc):
            raise InstagramError(f"@{handle} no existeix o no és un compte professional ({exc})") from exc
        raise
    media = ((data.get("business_discovery") or {}).get("media") or {}).get("data") or []
    return [p for p in (parse_post(m) for m in media) if p]


def parse_post(media: dict) -> Post | None:
    if not media.get("id") or not media.get("timestamp"):
        return None
    images = []
    if media.get("media_type") == "CAROUSEL_ALBUM":
        images = [c["media_url"] for c in (media.get("children") or {}).get("data", [])
                  if c.get("media_type") == "IMAGE" and c.get("media_url")][:2]
    elif media.get("media_type") == "IMAGE" and media.get("media_url"):
        images = [media["media_url"]]
    elif media.get("thumbnail_url"):  # vídeo: la portada sovint és el cartell
        images = [media["thumbnail_url"]]
    return Post(
        id=media["id"],
        caption=(media.get("caption") or "").strip(),
        permalink=media.get("permalink") or "",
        timestamp=datetime.strptime(media["timestamp"], "%Y-%m-%dT%H:%M:%S%z"),
        image_urls=images,
    )


def posts_prompt(posts: list[Post]) -> str:
    """Text per a Gemini: una secció per publicació, amb l'enllaç que ha de fer servir com a detail_url."""
    blocks = []
    for i, post in enumerate(posts, 1):
        blocks.append(
            f"--- POST {i} (published {post.timestamp:%Y-%m-%d}; detail_url: {post.permalink}; "
            f"{len(post.image_urls)} attached image(s)) ---\n{post.caption or '(no caption)'}"
        )
    return (
        "Instagram posts from this account. The attached images are, in order, the images of the posts below "
        "(often the event poster). Use the post's detail_url for its events. The publication date is NOT the "
        "event date.\n\n" + "\n\n".join(blocks)
    )
