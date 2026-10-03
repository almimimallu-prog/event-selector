"""Assignació de categoria sense LLM: etiquetes de la font i, si no n'hi ha, paraules clau del títol."""

import re

from .models import Category

# Etiquetes de l'Agenda Cultural de Catalunya (tags_categor_es / tags_mbits, última part del camí).
# "rutes-i-visites" no hi és: barreja excursions (esport) i visites guiades (cultura) → paraules clau.
GENCAT_TAGS: dict[str, Category] = {
    "esports": "esport_natura",
    "conferencies": "formacio_tech",
    "cursos": "formacio_tech",
    "cultura-digital": "formacio_tech",
    "divulgacio": "formacio_tech",
    "fires-i-mercats": "gastronomia_social",
    "festes": "gastronomia_social",
    "sardanes": "gastronomia_social",
    "gastronomia": "gastronomia_social",
    "tradicional-i-popular": "gastronomia_social",
}

# Ordre important: la primera regla que coincideix guanya ("Taller de teatre" → formació).
_EXHIBITION = re.compile(r"^\W*(exposició|mostra)\b", re.I)

KEYWORDS: list[tuple[Category, re.Pattern]] = [
    ("cultura", _EXHIBITION),
    # Abans que formació ("meetup") i social ("festa"): "Speed dating", "Festa per a solters".
    ("dating", re.compile(r"(speed.?dating|\bdating\b|\bsolter[oae]?s?\b|\bsingles\b|\bsingle (?:night|party|event)|cites? r[àa]pides|"
                          r"citas? r[áa]pidas|cites? a cegues|citas? a ciegas|lonely hearts)", re.I)),
    ("formacio_tech", re.compile(r"\b(taller|curs|curset|conferència|xerrada|seminari|jornada|col·loqui|"
                                 r"masterclass|formació|hackathon|meetup|programació|robòtica|steam)", re.I)),
    ("esport_natura", re.compile(r"\b(ruta|caminada|excursió|passejada|cursa|marxa|bicicleta|btt|ioga|"
                                 r"esport|natura|senderisme|trail|pilates|gimnàstica|tai.?txi)", re.I)),
    ("gastronomia_social", re.compile(r"\b(mercat|fira|tast|gastronom|sopar|dinar|vermut|festa|ball|"
                                      r"sardana|calçotada|cercavila|correfoc|castell)", re.I)),
    ("cultura", re.compile(r"\b(concert|teatre|exposició|cinema|dansa|espectacle|lectura|òpera|"
                           r"música|circ|recital|projecció|club de lectura|contacontes|visita|jazz|blues|rock|flamenc|"
                           r"coral|orquestra|cantata|monòleg|titelles|festival)", re.I)),
]


def from_gencat_tags(*tag_fields: str | None) -> Category | None:
    for field in tag_fields:
        for tag in (field or "").split(","):
            category = GENCAT_TAGS.get(tag.rsplit("/", 1)[-1].strip())
            if category:
                return category
    return None


def from_keywords(text: str) -> Category | None:
    for category, pattern in KEYWORDS:
        if pattern.search(text):
            return category
    return None


def gencat_tag_names(*tag_fields: str | None) -> list[str]:
    names = []
    for field in tag_fields:
        for tag in (field or "").split(","):
            name = tag.rsplit("/", 1)[-1].strip()
            if name and name not in names:
                names.append(name)
    return names


def is_exhibition(title: str) -> bool:
    return bool(_EXHIBITION.search(title))
