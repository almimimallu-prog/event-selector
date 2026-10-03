import { local } from "./dates";
import type { AppEvent, Learning, Prefs, Zone } from "./types";

// Rànquing explicable (PROPOSTA.md §7):
// puntuació = 35·interès + 25·proximitat + 20·horari + 10·font + 10·novetat
// L'interès combina els interessos manuals (Configuració) amb el que s'aprèn de les marques (app_learning).
export const SCORE_PARTS = [
  { key: "interest", label: "Interès", max: 35 },
  { key: "proximity", label: "Proximitat", max: 25 },
  { key: "schedule", label: "Horari", max: 20 },
  { key: "source", label: "Font", max: 10 },
  { key: "novelty", label: "Novetat", max: 10 },
] as const;

export type Score = { total: number; parts: number[] };

// Penalitzacions apreses: es multiplica la part corresponent.
const FAR_FACTOR = 0.4;
const EXPENSIVE_FACTOR = 0.6;
const BAD_SLOT_FACTOR = 0.4;
const BAD_SLOT_MIN = 2;
const PROXIMITY_HALF_KM = 15; // a aquesta distància, la meitat dels punts de proximitat // descarts per "mal horari" a la mateixa franja abans de penalitzar-la

export function daySlot(event: AppEvent): string {
  const l = local(event.start_at);
  const hour = Number(l.hhmm.slice(0, 2));
  return `${l.weekday + 1}-${hour < 14 ? "mati" : hour < 20 ? "tarda" : "nit"}`;
}

function availability(event: AppEvent, prefs: Prefs): number {
  if (event.all_day || event.kind !== "session") return 0.7;
  const l = local(event.start_at);
  const isoDay = l.weekday + 1;
  const slot = prefs.availability.find((s) => s.days.includes(isoDay) && l.hhmm >= s.from && l.hhmm <= s.to);
  const base = slot ? slot.weight : prefs.default_availability_weight;
  return (prefs.learning.bad_slots[daySlot(event)] ?? 0) >= BAD_SLOT_MIN ? base * BAD_SLOT_FACTOR : base;
}

/** Pes d'una categoria (0–1): l'interès manual fa de punt de partida i les marques el corregeixen. */
export function categoryWeight(category: AppEvent["category"], prefs: Prefs): number {
  const manual = prefs.category_weights[category] ?? 0.5;
  const c = prefs.learning.categories[category];
  return c ? (c.pos + 2 * manual) / (c.pos + c.neg + 2) : manual;
}

/** Afinitat amb les etiquetes del pla (−1 a 1), segons els plans marcats amb aquestes etiquetes. */
function tagAffinity(event: AppEvent, learning: Learning): number {
  const known = event.tags.map((t) => learning.tags[t.toLowerCase()]).filter(Boolean);
  if (!known.length) return 0;
  return known.reduce((sum, c) => sum + (c.pos - c.neg) / (c.pos + c.neg + 2), 0) / known.length;
}

const toRad = (d: number) => (d * Math.PI) / 180;
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Distància a la zona principal (la primera activa), si se'n coneixen les coordenades. */
export function homeKm(event: AppEvent, zones: Zone[]): number | null {
  const home = zones.find((z) => z.active);
  if (event.lat == null || event.lon == null || home?.lat == null || home.lon == null) return null;
  return distanceKm(event.lat, event.lon, home.lat, home.lon);
}

export function score(event: AppEvent, prefs: Prefs, zones: Zone[], now = new Date()): Score {
  const { learning } = prefs;
  let interestFactor = Math.min(1, Math.max(0, 0.4 + 0.6 * categoryWeight(event.category, prefs) + 0.2 * tagAffinity(event, learning)));
  if (learning.expensive_eur != null && (event.price_min ?? 0) >= learning.expensive_eur) interestFactor *= EXPENSIVE_FACTOR;
  const interest = 35 * interestFactor;

  // Proximitat en km reals (no relativa al radi): 0 km → 25, 5 km → 19, 15 km → 12,5, 50 km → 6.
  let proximity = event.zone_km == null ? 12 : 25 / (1 + event.zone_km / PROXIMITY_HALF_KM);
  const fromHome = homeKm(event, zones);
  if (learning.far_km != null && fromHome != null && fromHome > learning.far_km) proximity *= FAR_FACTOR;

  const schedule = 20 * availability(event, prefs);
  const source = 10 * (event.sources.length > 1 ? 1 : 0.6);
  const ageDays = (now.getTime() - new Date(event.first_seen_at).getTime()) / 86_400_000;
  const novelty = 10 * Math.max(0, 1 - ageDays / 14);

  const parts = [interest, proximity, schedule, source, novelty].map((x) => Math.round(x));
  return { total: parts.reduce((a, b) => a + b, 0), parts };
}

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** true si el pla conté alguna paraula bloquejada (títol, explicació, etiquetes o lloc). */
export function isBlocked(event: AppEvent, blocked: string[]): boolean {
  if (!blocked.length) return false;
  const text = normalize([event.title, event.summary_ca, event.venue_name, ...event.tags].filter(Boolean).join(" "));
  return blocked.some((w) => w.trim() && new RegExp(`\\b${normalize(w.trim()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text));
}

export function nearestZoneLabel(event: AppEvent): string | null {
  if (event.zone_km == null) return null;
  return event.zone_km < 1 ? "<1 km" : `${Math.round(event.zone_km)} km`;
}
