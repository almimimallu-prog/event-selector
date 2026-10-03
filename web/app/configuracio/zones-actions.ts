"use server";

import { revalidatePath } from "next/cache";
import { findMunicipality } from "@/lib/municipis";
import { createClient } from "@/lib/supabase/server";
import { MAX_KM, MAX_ZONES, MIN_KM } from "@/lib/zones";

export type FormState = { status: "idle" | "ok" | "error"; message?: string };

function refresh() {
  revalidatePath("/", "layout"); // inici, exposicions, cursos... depenen de les zones
}

async function activeZones() {
  const supabase = await createClient();
  const { data } = await supabase.from("user_zones").select("id, active, sort_order").order("sort_order");
  return { supabase, zones: data ?? [] };
}

export async function addZone(_prev: FormState, form: FormData): Promise<FormState> {
  const place = findMunicipality(String(form.get("name") ?? ""));
  if (!place) return { status: "error", message: "No trobo aquest municipi. Tria'l de la llista." };
  const radius = Number(form.get("radius"));
  if (!(radius >= MIN_KM && radius <= MAX_KM)) return { status: "error", message: `El radi ha de ser de ${MIN_KM} a ${MAX_KM} km.` };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("user_zones").select("name, sort_order");
  if ((existing?.length ?? 0) >= MAX_ZONES) {
    return { status: "error", message: `Com a màxim ${MAX_ZONES} municipis. Canvia'n un o esborra'l abans.` };
  }
  if (existing?.some((z) => z.name.toLowerCase() === place.name.toLowerCase())) {
    return { status: "error", message: `Ja tens la zona ${place.name}.` };
  }
  const { error } = await supabase.from("user_zones").insert({
    name: place.name,
    center: `SRID=4326;POINT(${place.lon} ${place.lat})`,
    radius_km: radius,
    sort_order: Math.max(-1, ...(existing ?? []).map((z) => z.sort_order)) + 1,
  });
  if (error) return { status: "error", message: `No s'ha pogut desar (${error.message}).` };
  refresh();
  return { status: "ok", message: `Zona ${place.name} afegida. Els esdeveniments nous d'aquesta zona arribaran a la propera actualització.` };
}

export async function setZoneRadius(id: string, radius: number): Promise<string | null> {
  if (!(radius >= MIN_KM && radius <= MAX_KM)) return `El radi ha de ser de ${MIN_KM} a ${MAX_KM} km.`;
  const supabase = await createClient();
  const { error } = await supabase.from("user_zones").update({ radius_km: radius }).eq("id", id);
  if (error) return error.message;
  refresh();
  return null;
}

/** Canvia el municipi d'una zona (n'actualitza el centre) i en manté el radi. */
export async function setZoneMunicipality(id: string, name: string): Promise<string | null> {
  const place = findMunicipality(name);
  if (!place) return `No trobo el municipi «${name}». Tria'l de la llista.`;
  const supabase = await createClient();
  const { data: existing } = await supabase.from("user_zones").select("id, name");
  if (existing?.some((z) => z.id !== id && z.name.toLowerCase() === place.name.toLowerCase())) {
    return `Ja tens la zona ${place.name}.`;
  }
  const { error } = await supabase
    .from("user_zones")
    .update({ name: place.name, center: `SRID=4326;POINT(${place.lon} ${place.lat})` })
    .eq("id", id);
  if (error) return error.message;
  refresh();
  return null;
}

export async function setZoneActive(id: string, active: boolean): Promise<string | null> {
  const { supabase, zones } = await activeZones();
  if (!active && zones.filter((z) => z.active && z.id !== id).length === 0) return "Cal tenir com a mínim una zona activa.";
  const { error } = await supabase.from("user_zones").update({ active }).eq("id", id);
  if (error) return error.message;
  refresh();
  return null;
}

export async function deleteZone(id: string): Promise<string | null> {
  const { supabase, zones } = await activeZones();
  if (zones.filter((z) => z.active && z.id !== id).length === 0) return "Cal tenir com a mínim una zona activa.";
  const { error } = await supabase.from("user_zones").delete().eq("id", id);
  if (error) return error.message;
  refresh();
  return null;
}

/** La zona principal és la primera: la de "Sense sortir de…". */
export async function makeMainZone(id: string): Promise<string | null> {
  const { supabase, zones } = await activeZones();
  const order = [id, ...zones.map((z) => z.id).filter((z) => z !== id)];
  for (const [i, zoneId] of order.entries()) {
    const { error } = await supabase.from("user_zones").update({ sort_order: i, ...(zoneId === id ? { active: true } : {}) }).eq("id", zoneId);
    if (error) return error.message;
  }
  refresh();
  return null;
}
