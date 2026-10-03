"use server";

import { revalidatePath } from "next/cache";
import { findMunicipality } from "@/lib/municipis";
import { createClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/", "layout");
}

/** Es queda p_keep i s'hi fusiona p_dup (fonts, marca i dades que hi faltin). */
export async function mergeEvents(keep: string, dup: string): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("app_merge_events", { p_keep: keep, p_dup: dup });
  if (error) return error.message;
  refresh();
  return null;
}

export async function markDistinct(id: number): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("app_resolve_duplicate", { p_id: id, p_status: "distinct" });
  if (error) return error.message;
  refresh();
  return null;
}

/** Publica un esdeveniment retingut; opcionalment n'indica el municipi (i se'n situa el centre). */
export async function approveEvent(id: string, cityName?: string): Promise<string | null> {
  const values: Record<string, unknown> = { status: "published", review_reasons: [] };
  if (cityName?.trim()) {
    const place = findMunicipality(cityName);
    if (!place) return `No trobo el municipi «${cityName}».`;
    Object.assign(values, { city: place.name, geo: `SRID=4326;POINT(${place.lon} ${place.lat})` });
  }
  const supabase = await createClient();
  const { error } = await supabase.from("events").update(values).eq("id", id);
  if (error) return error.message;
  refresh();
  return null;
}

export async function rejectEvent(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ status: "rejected" }).eq("id", id);
  if (error) return error.message;
  refresh();
  return null;
}
