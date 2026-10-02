"""Client mínim de l'API de Gemini (REST) amb sortida JSON estructurada.

Sense SDK: una sola crida (`generateContent`) amb `responseJsonSchema`. La clau va a la capçalera,
mai a la URL, perquè no quedi als registres.
"""

import base64
import os
import time
from dataclasses import dataclass

import httpx

API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
# Àlies estables que apunten als Flash més recents; es poden canviar amb GEMINI_MODEL / GEMINI_FALLBACK_MODEL.
# Cada model té quota gratuïta pròpia: si el principal s'esgota o està saturat, es prova l'alternatiu.
DEFAULT_MODEL = "gemini-flash-latest"
DEFAULT_FALLBACK_MODEL = "gemini-flash-lite-latest"
OVERLOADED = {500, 503, 504}


class QuotaExceeded(Exception):
    """429: s'ha esgotat la quota gratuïta (per minut o per dia)."""


class GeminiError(Exception):
    pass


@dataclass
class Usage:
    model: str
    input_tokens: int
    output_tokens: int


@dataclass
class Attachment:
    mime_type: str  # image/jpeg, image/png, application/pdf
    data: bytes


def generate_json(
    client: httpx.Client,
    api_key: str,
    *,
    system: str,
    prompt: str,
    schema: dict,
    attachments: tuple[Attachment, ...] = (),
    model: str | None = None,
    timeout: float = 120,
) -> tuple[str, Usage]:
    """Retorna (text JSON, ús de tokens). La validació amb Pydantic la fa qui crida."""
    models = [model] if model else [os.getenv("GEMINI_MODEL") or DEFAULT_MODEL,
                                    os.getenv("GEMINI_FALLBACK_MODEL") or DEFAULT_FALLBACK_MODEL]
    parts = [{"text": prompt}]
    parts += [{"inline_data": {"mime_type": a.mime_type, "data": base64.b64encode(a.data).decode()}}
              for a in attachments]
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseJsonSchema": schema,
            "temperature": 0,
        },
    }
    last_error: Exception = GeminiError("cap model disponible")
    for name in models:
        for attempt in range(3):
            try:
                response = client.post(API.format(model=name), json=body, headers={"x-goog-api-key": api_key},
                                       timeout=timeout)
            except httpx.TimeoutException as exc:  # model saturat que no respon: com un 503
                last_error = GeminiError(f"{name}: temps d'espera esgotat ({exc})")
                time.sleep(5 * (attempt + 1))
                continue
            if response.status_code == 200:
                return _parse(response.json(), name)
            if response.status_code == 429:
                last_error = QuotaExceeded(f"{name}: {response.text[:300]}")
                break  # quota d'aquest model esgotada → següent model
            last_error = GeminiError(f"{name} {response.status_code}: {response.text[:300]}")
            if response.status_code not in OVERLOADED:
                raise last_error
            time.sleep(5 * (attempt + 1))
    raise last_error


def _parse(data: dict, model: str) -> tuple[str, Usage]:
    candidates = data.get("candidates") or []
    if not candidates or "content" not in candidates[0]:
        reason = (candidates[0].get("finishReason") if candidates else None) or data.get("promptFeedback")
        raise GeminiError(f"Resposta buida ({reason})")
    text = "".join(p.get("text", "") for p in candidates[0]["content"].get("parts", []))
    meta = data.get("usageMetadata", {})
    usage = Usage(model=data.get("modelVersion", model), input_tokens=meta.get("promptTokenCount", 0),
                  output_tokens=meta.get("candidatesTokenCount", 0))
    return text, usage
