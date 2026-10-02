"""HTML → text compacte per a l'LLM (pas 5 del pipeline) i lectura de JSON-LD schema.org/Event (pas 4).

Sense dependències: n'hi ha prou amb treure el soroll (scripts, menús, peus, bàners de galetes) i
conservar els enllaços, que porten a les fitxes de detall.
"""

import html
import json
import re
from urllib.parse import urljoin

_DROP_BLOCKS = re.compile(
    r"<(script|style|noscript|svg|nav|header|footer|form|iframe|template)\b[^>]*>.*?</\1\s*>", re.S | re.I
)
_COOKIE_BLOCK = re.compile(
    r"<(div|section|aside)\b[^>]*(?:cookie|cmplz|consent|gdpr)[^>]*>.*?</\1\s*>", re.S | re.I
)
_BLOCK_TAGS = re.compile(r"</?(p|div|section|article|li|ul|ol|h[1-6]|tr|table|br|hr|dl|dt|dd|time)\b[^>]*>", re.I)
_LINK = re.compile(r"<a\b[^>]*href=[\"']([^\"'#]+)[\"'][^>]*>(.*?)</a\s*>", re.S | re.I)
_IMG = re.compile(r"<img\b[^>]*\bsrc=[\"']([^\"']+)[\"'][^>]*>", re.I)


def html_to_text(page: str, base_url: str | None = None, max_chars: int = 40_000) -> str:
    """Text llegible amb enllaços en format markdown [text](url) i imatges com ![](url)."""
    body = re.search(r"<body\b[^>]*>(.*)</body\s*>", page, re.S | re.I)
    page = body[1] if body else page
    page = re.sub(r"<!--.*?-->", "", page, flags=re.S)
    page = _DROP_BLOCKS.sub(" ", page)
    page = _COOKIE_BLOCK.sub(" ", page)

    def link(m: re.Match) -> str:
        text = re.sub(r"<[^>]+>", " ", m[2]).strip()
        url = urljoin(base_url, m[1]) if base_url else m[1]
        return f"[{re.sub(r'\s+', ' ', text)}]({url})" if text else ""

    def image(m: re.Match) -> str:
        src = m[1]
        if src.startswith("data:") or re.search(r"(logo|icon|sprite|pixel)", src, re.I):
            return " "
        return f" ![]({urljoin(base_url, src) if base_url else src}) "

    page = _LINK.sub(link, page)
    page = _IMG.sub(image, page)
    page = _BLOCK_TAGS.sub("\n", page)
    text = html.unescape(re.sub(r"<[^>]+>", " ", page)).replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n[ \n]*", "\n", text).strip()
    return text[:max_chars]


def json_ld_events(page: str) -> list[dict]:
    """Objectes schema.org de tipus Event (o subtipus: MusicEvent, TheaterEvent...) de la pàgina."""
    found = []
    for raw in re.findall(r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", page, re.S | re.I):
        try:
            data = json.loads(html.unescape(raw.strip()))
        except json.JSONDecodeError:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            item = stack.pop(0)
            if not isinstance(item, dict):
                continue
            stack.extend(item.get("@graph", []))
            types = item.get("@type", [])
            types = types if isinstance(types, list) else [types]
            if any(isinstance(t, str) and t.endswith("Event") for t in types):
                found.append(item)
    return found
