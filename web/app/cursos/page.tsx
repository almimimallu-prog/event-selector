import { EventBrowser } from "@/components/event-browser";
import { loadEvents, loadSettings } from "@/lib/data";
import { addDays, madridMidnight, todayKey } from "@/lib/dates";
import { readLocalOnly } from "@/lib/local-mode-server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Cursos · Event Selector" };

// Cursos amb sessions pendents: una fitxa per curs, amb la propera sessió.
export default async function CoursesPage() {
  const today = todayKey();
  const supabase = await createClient();
  const [{ prefs, zones }, events] = await Promise.all([
    loadSettings(supabase),
    loadEvents(supabase, madridMidnight(today), madridMidnight(addDays(today, 60)), "course"),
  ]);
  return (
    <EventBrowser mode="list" title="Cursos" sort="score" emptyText="No hi ha cursos a les teves zones."
                  events={events} prefs={prefs} zones={zones} initialLocalOnly={await readLocalOnly()} />
  );
}
