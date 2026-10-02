"""Esquema de sortida de l'extracció (el mateix que es passa a Gemini com a response_schema).

Els valors de Category han de coincidir amb l'enum `event_category` de la BD.
"""

from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from .config import TIMEZONE

Category = Literal["cultura", "esport_natura", "formacio_tech", "gastronomia_social"]
# session: un dia i hora concrets (surt al calendari) · long_running: exposicions i similars (pestanya pròpia)
# course: curs amb inscripció per a totes les sessions (secció "Cursos"). Coincideix amb l'enum event_kind.
Kind = Literal["session", "long_running", "course"]

# Per sota d'aquest llindar l'esdeveniment va a la safata "Per revisar".
REVIEW_CONFIDENCE = 0.6
MAX_MONTHS_AHEAD = 18


class ExtractedEvent(BaseModel):
    is_event: bool = Field(description="Fals si el contingut no descriu cap esdeveniment concret")
    title: str = Field(min_length=3, max_length=200)
    start: datetime = Field(description="Inici en ISO 8601, zona Europe/Madrid")
    end: datetime | None = None
    all_day: bool = Field(default=False, description="Cert si no se'n coneix l'hora")
    kind: Kind = "session"
    detail_url: str | None = Field(default=None, description="Enllaç a la fitxa de l'esdeveniment, si n'hi ha")
    image_url: str | None = None
    venue_name: str | None = None
    address: str | None = None
    city: str | None = None
    price_min: float | None = Field(default=None, ge=0)
    is_free: bool | None = None
    price_text: str | None = None
    registration_url: str | None = None
    registration_deadline: date | None = None
    category: Category
    tags: list[str] = Field(default_factory=list, max_length=10)
    accessibility_notes: str | None = None
    summary_ca: str = Field(description="Resum de màxim 2 línies en català")
    confidence: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def _localize(self) -> "ExtractedEvent":
        # L'LLM ha de donar l'hora local de Catalunya sense zona, però a vegades hi enganxa una "Z"
        # (12:15 → "12:15Z"). Sempre és l'hora del cartell: es reinterpreta com a hora local.
        self.start = self.start.replace(tzinfo=TIMEZONE)
        if self.end is not None:
            self.end = self.end.replace(tzinfo=TIMEZONE)
        if self.end is not None and self.end < self.start:
            raise ValueError("end ha de ser posterior a start")
        return self

    def problems(self, now: datetime) -> list[str]:
        """Motius per no publicar-lo directament (llista buida = es pot publicar)."""
        issues = []
        if not self.is_event:
            issues.append("no és un esdeveniment")
        if (self.end or self.start) < now - timedelta(days=1):
            issues.append("ja ha passat")
        if self.start > now + timedelta(days=30 * MAX_MONTHS_AHEAD):
            issues.append("data massa llunyana")
        if self.confidence < REVIEW_CONFIDENCE:
            issues.append("confiança baixa")
        if not (self.venue_name or self.address or self.city):
            issues.append("sense lloc")
        return issues


class ExtractionResult(BaseModel):
    events: list[ExtractedEvent] = Field(default_factory=list)


class SourceEvent(BaseModel):
    """Esdeveniment ja estructurat que surt d'un adaptador (API, ICS, JSON-LD) sense passar per l'LLM."""

    source: str                         # 'gencat' | 'bcn' | ...
    external_id: str                    # estable entre execucions (inclou la data si és una sessió d'un cicle)
    title: str
    start: datetime
    end: datetime | None = None
    all_day: bool = False
    kind: Kind = "session"
    schedule_text: str | None = None    # horari llegible per a cursos i llarga durada ("Dilluns de 10.30 h a 12 h")
    venue_name: str | None = None
    address: str | None = None
    city: str | None = None
    lat: float | None = None
    lon: float | None = None
    price_min: float | None = None
    is_free: bool | None = None
    price_text: str | None = None
    registration_url: str | None = None
    url: str | None = None
    image_url: str | None = None
    category: Category
    category_guessed: bool = False      # cap etiqueta ni paraula clau: s'ha posat la categoria per defecte
    tags: list[str] = Field(default_factory=list)
    description: str | None = None
    series_key: str | None = None
