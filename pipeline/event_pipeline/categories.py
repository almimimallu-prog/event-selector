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
    # Abans que formació i social ("festa"): "Speed dating", "Festa per a solters", "First Dates Express (25-35)".
    ("dating", re.compile(r"(speed.?dating|\bdating\b|\bsolter[oae]?s?\b|\bsingles\b|\bsingle (?:night|party|event)|"
                          r"cites? r[àa]pides|citas? r[áa]pidas|cites? a cegues|citas? a ciegas|lonely hearts|"
                          r"first (?:dates?|match)|blind dates?|dates? express|\bdates? \+?\d\d|\b\w+ dates \+?\d\d|matchmaking|"
                          r"amor a primera vista|love at first sight)", re.I)),
    # Social inequívoc (en català, castellà i anglès), abans que formació, esport i cultura: "Happy hour + stand up".
    ("gastronomia_social", re.compile(
        r"\b(party|parties|happy hour|after.?work|drinks|cocktails?|beers?|cervesa|cerveza|oktoberfest|"
        r"breakfast|brunch|esmorzar|desayuno|pub crawl|bar crawl|boat|barco|vaixell|karaoke|quiz|trivia|"
        r"language exchange|intercambio|intercanvi|tandem|parlem catal\w*|xerrem|conversa en catal\w*|"
        r"(?:language|conversation|conversa) (?:practice|meetup|club|exchange)|"
        r"board games?|jocs de taula|juegos de mesa|chess|escacs|"
        r"ajedrez|werewol(?:f|ves)|hombres lobo|game night|nit de jocs|noche de juegos|picnic|meet new people|"
        r"make (?:new )?friends|social (?:night|event|club|hike))", re.I)),
    ("formacio_tech", re.compile(
        r"\b(taller|curs|curset|conferència|xerrada|seminari|jornada|col·loqui|masterclass|formació|hackathon|"
        r"programació|robòtica|steam|workshop|talk|conference|seminar|webinar|curso|charla|conferencia|"
        r"bootcamp|tech\b|coding|programming|python|javascript|wordpress|developers?|startups?|\bai\b|"
        r"machine learning|data science|fintech|blockchain|crypto|defi|invest\w*|inversi\w*|finance|finanzas)", re.I)),
    ("esport_natura", re.compile(
        r"\b(ruta|caminada|excursió|passejada|cursa|marxa|bicicleta|btt|ioga|esport|natura\b|naturalesa|naturaleza|senderisme|trail|"
        r"pilates|gimnàstica|tai.?txi|hike|hiking|trekking|senderismo|excursión|caminata|running|run\b|yoga|"
        r"bike|cycling|kayak|paddle|surf|climbing|escalada|via verde|via verda)", re.I)),
    ("gastronomia_social", re.compile(
        r"\b(mercat|fira|tast|gastronom|sopar|dinar|vermut|festa|ball|sardana|calçotada|cercavila|correfoc|"
        r"castell|salsa|bachata|kizomba|swing|cena|comida|tapas|pizza|wine|vino|vi negre|social|networking|"
        r"friends|amigos|amics|fiesta)", re.I)),
    ("cultura", re.compile(
        r"\b(concert|teatre|exposició|cinema|cinef[oò]rum|cineforum|cineclub|dansa|espectacle|lectura|òpera|música|circ|recital|projecció|"
        r"club de lectura|contacontes|visita|jazz|blues|rock|flamenc|coral|orquestra|cantata|monòleg|titelles|"
        r"festival|theatre|theater|comedy|stand.?up|music|film|movie|museum|museo|gallery|exhibition|"
        r"opera|ballet|teatro|concierto|exposición|book club)", re.I)),
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


def classify(title: str, *context: str | None, default: Category | None = None) -> Category | None:
    """Ordre: paraules clau del títol → categoria per defecte de la font → paraules clau de la descripció.
    ("BREAKFAST (BUFFET LIBRE)" és social encara que la descripció parli de música; una xerrada d'un grup
    tecnològic és formació encara que la descripció digui "beer & networking".)"""
    return from_keywords(title) or default or from_keywords(" ".join(c for c in context if c))


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
