import type { AppEvent } from "./types";

const compact = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Enllaç directe a Google Calendar (sense OAuth). */
export function googleCalendarUrl(event: AppEvent): string {
  const start = new Date(event.start_at);
  let dates: string;
  if (event.all_day) {
    const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
    const next = new Date(start.getTime() + 86_400_000);
    dates = `${day(start)}/${day(next)}`;
  } else {
    const end = event.end_at && event.kind === "session" ? new Date(event.end_at) : new Date(start.getTime() + 2 * 3_600_000);
    dates = `${compact(start.toISOString())}/${compact(end.toISOString())}`;
  }
  const where = [event.venue_name, event.city].filter(Boolean).join(", ");
  const details = [event.summary_ca, event.url].filter(Boolean).join("\n\n");
  const params = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates, ctz: "Europe/Madrid" });
  if (where) params.set("location", where);
  if (details) params.set("details", details);
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function mapsUrl(event: AppEvent): string | null {
  if (event.lat != null && event.lon != null) return `https://www.google.com/maps/search/?api=1&query=${event.lat},${event.lon}`;
  const q = [event.venue_name, event.city].filter(Boolean).join(" ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}
