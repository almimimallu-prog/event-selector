import { local } from "./dates";
import type { AppEvent, Prefs, Zone } from "./types";

// Rànquing explicable (PROPOSTA.md §7):
// puntuació = 35·interès + 25·proximitat + 20·horari + 10·font + 10·novetat
export const SCORE_PARTS = [
  { key: "interest", label: "Interès", max: 35 },
  { key: "proximity", label: "Proximitat", max: 25 },
  { key: "schedule", label: "Horari", max: 20 },
  { key: "source", label: "Font", max: 10 },
  { key: "novelty", label: "Novetat", max: 10 },
] as const;

export type Score = { total: number; parts: number[] };

function availability(event: AppEvent, prefs: Prefs): number {
  if (event.all_day || event.kind !== "session") return 0.7;
  const l = local(event.start_at);
  const isoDay = l.weekday + 1;
  const slot = prefs.availability.find((s) => s.days.includes(isoDay) && l.hhmm >= s.from && l.hhmm <= s.to);
  return slot ? slot.weight : prefs.default_availability_weight;
}

export function score(event: AppEvent, prefs: Prefs, zones: Zone[], now = new Date()): Score {
  const weight = prefs.category_weights[event.category] ?? 0.5;
  const interest = 35 * (0.4 + 0.6 * weight);

  const radius = zones.find((z) => z.name === event.zone_name)?.radius_km;
  const proximity = event.zone_km == null || !radius ? 12 : 25 * (1 - 0.6 * Math.min(1, event.zone_km / radius));

  const schedule = 20 * availability(event, prefs);
  const source = 10 * (event.sources.length > 1 ? 1 : 0.6);
  const ageDays = (now.getTime() - new Date(event.first_seen_at).getTime()) / 86_400_000;
  const novelty = 10 * Math.max(0, 1 - ageDays / 14);

  const parts = [interest, proximity, schedule, source, novelty].map((x) => Math.round(x));
  return { total: parts.reduce((a, b) => a + b, 0), parts };
}

export function nearestZoneLabel(event: AppEvent): string | null {
  if (event.zone_km == null) return null;
  return event.zone_km < 1 ? "<1 km" : `${Math.round(event.zone_km)} km`;
}
