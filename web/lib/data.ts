import type { SupabaseClient } from "@supabase/supabase-js";
import { type AppEvent, type Kind, type Learning, NO_LEARNING, type Prefs, type Zone } from "./types";

const DEFAULT_PREFS: Omit<Prefs, "learning"> = {
  category_weights: {}, availability: [], default_availability_weight: 0.2, blocked_tags: [],
};

export async function loadSettings(supabase: SupabaseClient): Promise<{ prefs: Prefs; zones: Zone[] }> {
  const [prefs, zones, learning] = await Promise.all([
    supabase.from("user_prefs").select("category_weights, availability, default_availability_weight, blocked_tags").maybeSingle(),
    // zone_list dona també les coordenades (migració 20261004000000); si no hi és, sense coordenades.
    supabase.rpc("zone_list").then((r) => (r.error ? supabase.from("user_zones").select("id, name, radius_km, active").order("sort_order") : r)),
    // app_learning: migració 20261005000000; si no hi és, el rànquing funciona sense aprenentatge.
    supabase.rpc("app_learning"),
  ]);
  return {
    prefs: {
      ...DEFAULT_PREFS,
      ...((prefs.data as Omit<Prefs, "learning"> | null) ?? {}),
      learning: learning.error ? NO_LEARNING : { ...NO_LEARNING, ...(learning.data as Learning) },
    },
    zones: ((zones.data ?? []) as Zone[]).map((z) => ({ ...z, radius_km: Number(z.radius_km) })),
  };
}

export async function loadEvents(
  supabase: SupabaseClient,
  from: Date,
  to: Date,
  kind: Kind = "session",
  mine = false,
): Promise<AppEvent[]> {
  // PostgREST retorna com a molt 1000 files per petició: paginem.
  const events: AppEvent[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .rpc("app_events", { p_from: from.toISOString(), p_to: to.toISOString(), p_kind: kind, p_mine: mine })
      .range(offset, offset + 999);
    if (error) throw new Error(`app_events: ${error.message}`);
    events.push(...((data ?? []) as AppEvent[]));
    if (!data || data.length < 1000) break;
  }
  return events;
}
