import { EventBrowser } from "@/components/event-browser";
import { loadEvents, loadSettings } from "@/lib/data";
import { addDays, madridMidnight, todayKey } from "@/lib/dates";
import { readLocalOnly } from "@/lib/local-mode-server";
import { createClient } from "@/lib/supabase/server";
import type { Kind } from "@/lib/types";

export const metadata = { title: "Els meus plans · Event Selector" };

// Tot el que has marcat amb ⭐ o ✅, de qualsevol tipus, per ordre de data.
export default async function PlansPage() {
  const today = todayKey();
  const from = madridMidnight(today);
  const to = madridMidnight(addDays(today, 365));
  const supabase = await createClient();
  const kinds: Kind[] = ["session", "long_running", "course"];
  const [{ prefs, zones }, ...lists] = await Promise.all([
    loadSettings(supabase),
    ...kinds.map((k) => loadEvents(supabase, from, to, k, true)),
  ]);
  return (
    <EventBrowser mode="list" title="Els meus plans" sort="date"
                  emptyText="Encara no has marcat res. Fes servir ⭐ M'interessa o ✅ Hi vaig a qualsevol esdeveniment."
                  events={lists.flat()} prefs={prefs} zones={zones} initialLocalOnly={await readLocalOnly()} />
  );
}
