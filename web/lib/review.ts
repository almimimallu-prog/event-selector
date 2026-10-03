import type { SupabaseClient } from "@supabase/supabase-js";

export type DupSide = {
  id: string; title: string; start_at: string; all_day: boolean; city: string | null; venue: string | null;
  url: string | null; summary: string | null; marked: boolean; sources: string[];
};
export type DuplicatePair = { id: number; score: number; a: DupSide; b: DupSide };
export type HeldEvent = {
  id: string; title: string; start_at: string; all_day: boolean; city: string | null; url: string | null;
  summary_ca: string | null; review_reasons: string[]; confidence: number | null; sources: string[];
};

const REASONS: Record<string, string> = {
  "sense lloc": "no diu on és",
  "confiança baixa": "Gemini no n'està segur",
  "data massa llunyana": "la data és molt llunyana",
};
export const reasonText = (r: string) => REASONS[r] ?? r;

/** Duplicats pendents i esdeveniments retinguts que encara no han passat. */
export async function loadReview(supabase: SupabaseClient): Promise<{ duplicates: DuplicatePair[]; held: HeldEvent[] }> {
  const today = new Date().toISOString().slice(0, 10);
  const [dups, held] = await Promise.all([
    supabase.rpc("app_duplicates"), // migració 20261009000000; sense ella, llista buida
    supabase
      .from("events")
      .select("id, title, start_at, all_day, city, url, summary_ca, review_reasons, confidence, event_sources(sources(name))")
      .eq("status", "review")
      .gte("start_at", today)
      .order("start_at")
      .limit(200),
  ]);
  type Row = Omit<HeldEvent, "sources"> & { event_sources: { sources: { name: string } | null }[] };
  return {
    duplicates: (dups.data ?? []) as DuplicatePair[],
    held: ((held.data ?? []) as unknown as Row[]).map(({ event_sources, ...e }) => ({
      ...e,
      sources: [...new Set(event_sources.map((s) => s.sources?.name).filter((n): n is string => !!n))],
    })),
  };
}

export async function reviewCount(supabase: SupabaseClient): Promise<number> {
  const { duplicates, held } = await loadReview(supabase);
  return duplicates.length + held.length;
}
