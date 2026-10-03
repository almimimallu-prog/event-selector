"use server";

// Selecció geogràfica: fins a MAX_ZONES municipis, cadascun amb un radi de 0 (només el municipi) a 200 km.
import { revalidatePath } from "next/cache";
import { findMunicipality, municipalityNames } from "@/lib/municipis";
import { createClient } from "@/lib/supabase/server";
import { MAX_KM, MAX_ZONES, MIN_KM } from "@/lib/zones";

export type FormState = { status: "idle" | "ok" | "error"; message?: string };

function refresh() {
  revalidatePath("/", "layout"); // inici, exposicions, cursos... depenen de les zones
}

const center = (p: { lon: number; lat: number }) => `SRID=4326;POINT(${p.lon} ${p.lat})`;
const badRadius = (r: number) => !(r >= MIN_KM && r <= MAX_KM);

/** Noms per al desplegable (es carreguen només quan s'obre l'editor). */
export async function getMunicipalityNames(): Promise<string[]> {
  return municipalityNames();
}

export async function addZone(_prev: FormState, form: FormData): Promise<FormState> {
  const place = findMunicipality(String(form.get("name") ?? ""));
  if (!place) return { status: "error", message: "No trobo aquest municipi. Tria'l de la llista." };
  const radius = Number(form.get("radius"));
  if (badRadius(radius)) return { status: "error", message: `El radi ha de ser de ${MIN_KM} a ${MAX_KM} km.` };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("user_zones").select("name, sort_order");
  if ((existing?.length ?? 0) >= MAX_ZONES) {
    return { status: "error", message: `Com a màxim ${MAX_ZONES} municipis. Canvia'n un o esborra'l abans.` };
  }
  if (existing?.some((z) => z.name.toLowerCase() === place.name.toLowerCase())) {
    return { status: "error", message: `Ja tens ${place.name}.` };
  }
  const { error } = await supabase.from("user_zones").insert({
    name: place.name,
    center: center(place),
    radius_km: radius,
    active: true,
    sort_order: Math.max(-1, ...(existing ?? []).map((z) => z.sort_order)) + 1,
  });
  if (error) return { status: "error", message: `No s'ha pogut desar (${error.message}).` };
  refresh();
  return { status: "ok", message: `${place.name} afegit. Els esdeveniments nous d'aquesta zona arribaran a la propera actualització.` };
}

export async function setZoneRadius(id: string, radius: number): Promise<string | null> {
  if (badRadius(radius)) return `El radi ha de ser de ${MIN_KM} a ${MAX_KM} km.`;
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
    return `Ja tens ${place.name}.`;
  }
  const { error } = await supabase.from("user_zones").update({ name: place.name, center: center(place) }).eq("id", id);
  if (error) return error.message;
  refresh();
  return null;
}

export async function deleteZone(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("user_zones").select("id");
  if ((data ?? []).filter((z) => z.id !== id).length === 0) return "Cal tenir com a mínim un municipi.";
  const { error } = await supabase.from("user_zones").delete().eq("id", id);
  if (error) return error.message;
  refresh();
  return null;
}
