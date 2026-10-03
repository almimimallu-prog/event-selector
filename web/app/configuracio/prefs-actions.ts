"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AvailabilitySlot, Category } from "@/lib/types";

const CATEGORIES: Category[] = ["cultura", "esport_natura", "formacio_tech", "gastronomia_social"];
const MAX_WORDS = 50;

// user_prefs té una sola fila (id = 1).
async function updatePrefs(values: Record<string, unknown>): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.from("user_prefs").update(values).eq("id", 1);
  if (error) return error.message;
  revalidatePath("/", "layout");
  return null;
}

export async function setCategoryWeight(category: Category, weight: number): Promise<string | null> {
  if (!CATEGORIES.includes(category) || !(weight >= 0 && weight <= 1)) return "Valor no vàlid.";
  const supabase = await createClient();
  const { data } = await supabase.from("user_prefs").select("category_weights").eq("id", 1).maybeSingle();
  return updatePrefs({ category_weights: { ...(data?.category_weights ?? {}), [category]: weight } });
}

export async function setBlockedWords(words: string[]): Promise<string | null> {
  const clean = [...new Set(words.map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2 && w.length <= 40))];
  if (clean.length > MAX_WORDS) return `Com a màxim ${MAX_WORDS} paraules.`;
  return updatePrefs({ blocked_tags: clean });
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function setAvailability(slots: AvailabilitySlot[], outsideWeight: number): Promise<string | null> {
  if (!(outsideWeight >= 0 && outsideWeight <= 1)) return "Valor no vàlid.";
  for (const s of slots) {
    if (!s.days.length) return "Cada franja ha de tenir com a mínim un dia.";
    if (!s.days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) return "Dia no vàlid.";
    if (!TIME.test(s.from) || !TIME.test(s.to)) return "Hora no vàlida (format HH:MM).";
    if (s.from >= s.to) return `La franja ${s.from}–${s.to} acaba abans de començar.`;
  }
  return updatePrefs({
    availability: slots.map((s) => ({ days: [...s.days].sort(), from: s.from, to: s.to, weight: 1 })),
    default_availability_weight: outsideWeight,
  });
}
