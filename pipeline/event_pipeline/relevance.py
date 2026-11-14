"""Filtre de les «Fonts proposades» amb gpt-oss (Groq, nivell gratuït): ¿aquest compte organitza o acull
esdeveniments als quals es pot anar? Les bios són curtes i es classifiquen per lots (una crida per lot), així que no
toca la quota de Gemini i queda lluny del límit de Groq (8.000 tokens/minut, 1.000 crides/dia).
"""

import json

import httpx

MODEL = "openai/gpt-oss-120b"
URL = "https://api.groq.com/openai/v1/chat/completions"
REASON_CHARS = 90

SYSTEM = """You review Instagram accounts proposed as event sources for a personal events calendar around
Igualada and Barcelona (Catalonia). An account is RELEVANT if it regularly organises or hosts public events or
activities a person could attend there: venues, theatres, museums, festivals, fairs and markets, cultural or
neighbourhood associations, town councils, libraries, parks and nature reserves with activities, sports clubs
or races, restaurants or bars that run events. It is NOT relevant if it is a brand or shop without events,
media, an individual or artist (unless it is clearly a local organiser), an account from far away, or unclear.
Answer only with JSON: {"profiles": [{"handle": "...", "relevant": true|false, "reason": "..."}]}, one item per
account, where reason is at most 12 words in Catalan."""


class RelevanceError(Exception):
    pass


def _describe(profile: dict) -> str:
    parts = [f"@{profile['handle']}"]
    if profile.get("name"):
        parts.append(f"name: {profile['name']}")
    if profile.get("bio"):
        parts.append("bio: " + " ".join(profile["bio"].split())[:300])
    if profile.get("website"):
        parts.append(f"website: {profile['website']}")
    if profile.get("mentioned_by"):
        parts.append("mentioned by: " + ", ".join(f"@{h}" for h in profile["mentioned_by"]))
    return " | ".join(parts)


def classify(client: httpx.Client, api_key: str, profiles: list[dict]) -> dict[str, dict]:
    """{handle: {"relevant": bool, "reason": str}} per als comptes que el model ha respost."""
    response = client.post(URL, timeout=60, headers={"Authorization": f"Bearer {api_key}"}, json={
        "model": MODEL,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": SYSTEM},
                     {"role": "user", "content": "\n".join(_describe(p) for p in profiles)}],
    })
    if response.status_code != 200:
        raise RelevanceError(f"Groq {response.status_code}: {response.text[:200]}")
    try:
        items = json.loads(response.json()["choices"][0]["message"]["content"]).get("profiles", [])
    except (KeyError, IndexError, ValueError, AttributeError) as exc:
        raise RelevanceError(f"Resposta de Groq il·legible: {exc}") from exc
    wanted = {p["handle"] for p in profiles}
    return {
        str(item["handle"]).lstrip("@").lower(): {"relevant": bool(item["relevant"]),
                                                  "reason": str(item.get("reason") or "")[:REASON_CHARS]}
        for item in items
        if isinstance(item, dict) and "relevant" in item and str(item.get("handle", "")).lstrip("@").lower() in wanted
    }
