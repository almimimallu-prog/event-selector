import { EventBrowser } from "@/components/event-browser";
import { loadEvents, loadSettings } from "@/lib/data";
import { addDays, isValidKey, madridMidnight, todayKey, weekStart } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

// Calendari: la setmana de ?week=AAAA-MM-DD (per defecte, l'actual).
export default async function CalendarPage({ searchParams }: PageProps<"/">) {
  const { week } = await searchParams;
  const today = todayKey();
  const requested = typeof week === "string" && isValidKey(week) ? week : today;
  const start = weekStart(requested);
  const end = addDays(start, 7);
  const initialDay =
    requested !== start ? requested : today >= start && today < end ? today : start;

  const supabase = await createClient();
  const [{ prefs, zones }, events] = await Promise.all([
    loadSettings(supabase),
    loadEvents(supabase, madridMidnight(start), madridMidnight(end), "session"),
  ]);

  return (
    <EventBrowser key={start} mode="calendar" weekStart={start} initialDay={initialDay}
                  events={events} prefs={prefs} zones={zones} />
  );
}
