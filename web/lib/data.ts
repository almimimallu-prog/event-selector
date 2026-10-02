import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppEvent, Kind, Prefs, Zone } from "./types";

const DEFAULT_PREFS: Prefs = { category_weights: {}, availability: [], default_availability_weight: 0.2 };

export async function loadSettings(supabase: SupabaseClient): Promise<{ prefs: Prefs; zones: Zone[] }> {
  const [prefs, zones] = await Promise.all([
    supabase.from("user_prefs").select("category_weights, availability, default_availability_weight").maybeSingle(),
    supabase.from("user_zones").select("id, name, radius_km, active").order("sort_order"),
  ]);
  return {
    prefs: (prefs.data as Prefs | null) ?? DEFAULT_PREFS,
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
