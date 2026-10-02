import { EventBrowser } from "@/components/event-browser";
import { loadEvents, loadSettings } from "@/lib/data";
import { addDays, madridMidnight, todayKey } from "@/lib/dates";
import { readLocalOnly } from "@/lib/local-mode-server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Exposicions · Event Selector" };

// Activitats de llarga durada obertes avui o els propers 60 dies.
export default async function ExhibitionsPage() {
  const today = todayKey();
  const supabase = await createClient();
  const [{ prefs, zones }, events] = await Promise.all([
    loadSettings(supabase),
    loadEvents(supabase, madridMidnight(today), madridMidnight(addDays(today, 60)), "long_running"),
  ]);
  return (
    <EventBrowser mode="list" title="Exposicions i activitats en curs" sort="score"
                  emptyText="No hi ha exposicions en curs a les teves zones." events={events} prefs={prefs} zones={zones} initialLocalOnly={await readLocalOnly()} />
  );
}
