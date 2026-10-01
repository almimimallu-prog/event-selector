"""Esquema de sortida de l'extracció (el mateix que es passa a Gemini com a response_schema).

Els valors de Category han de coincidir amb l'enum `event_category` de la BD.
"""

from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from .config import TIMEZONE

Category = Literal["cultura", "esport_natura", "formacio_tech", "gastronomia_social"]

# Per sota d'aquest llindar l'esdeveniment va a la safata "Per revisar".
REVIEW_CONFIDENCE = 0.6
MAX_MONTHS_AHEAD = 18


class ExtractedEvent(BaseModel):
    is_event: bool = Field(description="Fals si el contingut no descriu cap esdeveniment concret")
    title: str = Field(min_length=3, max_length=200)
    start: datetime = Field(description="Inici en ISO 8601, zona Europe/Madrid")
    end: datetime | None = None
    all_day: bool = False
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
        # Les dates sense zona s'interpreten com a hora local de Catalunya.
        if self.start.tzinfo is None:
            self.start = self.start.replace(tzinfo=TIMEZONE)
        if self.end is not None and self.end.tzinfo is None:
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
