"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isValidKey, madridMidnight, madridTime } from "@/lib/dates";
import { findMunicipality } from "@/lib/municipis";
import { createClient } from "@/lib/supabase/server";

export type AddState = { status: "idle" | "error"; message?: string };

const CATEGORIES = ["cultura", "esport_natura", "formacio_tech", "gastronomia_social", "dating"];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function addPlan(_prev: AddState, form: FormData): Promise<AddState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const title = get("title");
  const day = get("day");
  const from = get("from");
  const to = get("to");
  if (title.length < 3) return { status: "error", message: "Escriu un títol (com a mínim 3 lletres)." };
  if (!isValidKey(day)) return { status: "error", message: "Tria el dia." };
  if (from && !TIME.test(from)) return { status: "error", message: "Hora d'inici no vàlida." };
  if (to && (!TIME.test(to) || !from || to <= from)) return { status: "error", message: "L'hora de fi ha de ser després de la d'inici." };
  const category = get("category");
  if (!CATEGORIES.includes(category)) return { status: "error", message: "Tria una categoria." };
  const cityInput = get("city");
  const place = cityInput ? findMunicipality(cityInput) : undefined;
  if (cityInput && !place) return { status: "error", message: `No trobo el municipi «${cityInput}». Tria'l de la llista.` };
  const url = get("url");
  if (url && !/^https?:\/\//.test(url)) return { status: "error", message: "L'enllaç ha de començar per https://" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("app_add_event", {
    p: {
      title,
      start_at: (from ? madridTime(day, from) : madridMidnight(day)).toISOString(),
      end_at: to ? madridTime(day, to).toISOString() : "",
      all_day: !from,
      category,
      city: place?.name ?? "",
      lat: place?.lat ?? null,
      lon: place?.lon ?? null,
      venue_name: get("venue"),
      url,
      price_text: get("price"),
      note: get("note"),
      state: get("state") === "going" ? "going" : "interested",
    },
  });
  if (error) return { status: "error", message: `No s'ha pogut desar (${error.message}).` };
  revalidatePath("/", "layout");
  redirect(`/?week=${day}`);
}
