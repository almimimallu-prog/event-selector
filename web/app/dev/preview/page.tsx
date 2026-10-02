import { notFound } from "next/navigation";
import { EventBrowser } from "@/components/event-browser";
import { addDays, madridMidnight, todayKey, weekStart } from "@/lib/dates";
import type { AppEvent, Category, Prefs, Zone } from "@/lib/types";

// Vista prèvia amb dades inventades, NOMÉS en desenvolupament (npm run dev): per provar la UI sense sessió.
const ZONES: Zone[] = [
  { id: "1", name: "Igualada", radius_km: 30, active: true },
  { id: "2", name: "Barcelona", radius_km: 15, active: true },
];
const PREFS: Prefs = {
  category_weights: {},
  availability: [
    { days: [1, 2, 3, 4, 5], from: "18:00", to: "23:59", weight: 1 },
    { days: [6, 7], from: "00:00", to: "23:59", weight: 1 },
  ],
  default_availability_weight: 0.2,
};
const SAMPLES: [string, Category, string, string, number, string | null][] = [
  ["Jazz a l'Aurora: trio manouche", "cultura", "Teatre de l'Aurora", "Igualada", 1, "12 €"],
  ["Xerrada: IA a la vida diària", "formacio_tech", "Biblioteca Central", "Igualada", 1, null],
  ["Ruta Montserrat cara nord", "esport_natura", "Monistrol", "Monistrol de Montserrat", 22, null],
  ["Fira del vi de l'Anoia", "gastronomia_social", "Plaça de Cal Font", "Igualada", 0.4, "Tast 8 €"],
  ["Concert indie", "cultura", "Sala Apolo", "Barcelona", 2, "18 €"],
  ["Taller de fotografia mòbil", "formacio_tech", "Espai Cívic Centre", "Igualada", 2, null],
];

export default function DevPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const start = weekStart(todayKey());
  const events: AppEvent[] = [];
  for (let d = 0; d < 7; d++) {
    SAMPLES.forEach(([title, category, venue, city, km, price], i) => {
      if ((d + i) % 3 === 0) return;
      const hour = d >= 5 ? 10 + i * 2 : 17 + (i % 5);
      const startAt = new Date(madridMidnight(addDays(start, d)).getTime() + hour * 3_600_000);
      events.push({
        id: `${d}-${i}`, title, summary_ca: "Esdeveniment de mostra per provar la interfície.", description: null,
        start_at: startAt.toISOString(), end_at: null, all_day: i === 2 && d === 6, kind: "session", schedule_text: null,
        category, tags: [], price_min: null, price_text: price, is_free: price === null, registration_url: null,
        registration_deadline: null, url: null, image_url: null, series_key: null,
        first_seen_at: new Date().toISOString(), status: "published", city, lat: null, lon: null, venue_name: venue,
        venue_wheelchair: i % 2 ? "yes" : "unknown", user_state: d === 3 && i === 1 ? "going" : null,
        dismiss_reason: null, note: null, sources: [{ name: "Font de mostra", url: null }],
        zone_name: city === "Barcelona" ? "Barcelona" : "Igualada", zone_km: km, has_unseen_changes: false,
      });
    });
  }
  return (
    <EventBrowser mode="calendar" weekStart={start} initialDay={todayKey()} events={events} prefs={PREFS}
                  zones={ZONES} demo />
  );
}
