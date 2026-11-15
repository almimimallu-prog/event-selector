"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AvailabilitySlot, BlockedZone, Category } from "@/lib/types";

const CATEGORIES: Category[] = ["cultura", "esport_natura", "formacio_tech", "gastronomia_social", "dating"];
const MAX_WORDS = 50;

const SESSION_EXPIRED = "La sessió ha caducat. Torna a entrar.";

async function currentUserId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data } = await supabase.auth.getClaims();
  return typeof data?.claims?.sub === "string" ? data.claims.sub : null;
}

// user_prefs: una fila per usuari (la RLS només deixa tocar la pròpia). Upsert: si encara no en té, es crea.
async function updatePrefs(values: Record<string, unknown>): Promise<string | null> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return SESSION_EXPIRED;
  const { error } = await supabase.from("user_prefs").upsert({ ...values, user_id: userId });
  if (error) return error.message;
  revalidatePath("/", "layout");
  return null;
}

export async function setCategoryWeight(category: Category, weight: number): Promise<string | null> {
  if (!CATEGORIES.includes(category) || !(weight >= 0 && weight <= 1)) return "Valor no vàlid.";
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return SESSION_EXPIRED;
  const { data } = await supabase.from("user_prefs").select("category_weights").eq("user_id", userId).maybeSingle();
  return updatePrefs({ category_weights: { ...(data?.category_weights ?? {}), [category]: weight } });
}

type Supabase = Awaited<ReturnType<typeof createClient>>;
type BlockedAction = "add" | "remove" | "move";
const ZONES: BlockedZone[] = ["personal", "common"];
const ACTIONS: BlockedAction[] = ["add", "remove", "move"];

// Particulars: user_prefs de l'usuari. Comunes: l'única fila (id = 1) de shared_settings.
async function readBlocked(supabase: Supabase, userId: string, zone: BlockedZone) {
  const { data, error } = zone === "common"
    ? await supabase.from("shared_settings").select("blocked_tags").eq("id", 1).maybeSingle()
    : await supabase.from("user_prefs").select("blocked_tags").eq("user_id", userId).maybeSingle();
  return { words: (data?.blocked_tags as string[] | undefined) ?? [], error: error?.message ?? null };
}

async function writeBlocked(supabase: Supabase, userId: string, zone: BlockedZone, words: string[]) {
  const { error } = zone === "common"
    ? await supabase.from("shared_settings").upsert({ id: 1, blocked_tags: words })
    : await supabase.from("user_prefs").upsert({ user_id: userId, blocked_tags: words });
  return error?.message ?? null;
}

async function addTo(supabase: Supabase, userId: string, zone: BlockedZone, word: string): Promise<string | null> {
  const { words, error } = await readBlocked(supabase, userId, zone);
  if (error) return error;
  if (words.includes(word)) return null;
  if (words.length >= MAX_WORDS) return `Com a màxim ${MAX_WORDS} paraules per zona.`;
  return writeBlocked(supabase, userId, zone, [...words, word]);
}

async function removeFrom(supabase: Supabase, userId: string, zone: BlockedZone, word: string): Promise<string | null> {
  const { words, error } = await readBlocked(supabase, userId, zone);
  if (error) return error;
  return words.includes(word) ? writeBlocked(supabase, userId, zone, words.filter((w) => w !== word)) : null;
}

/**
 * Afegeix, treu o mou (cap a `zone`) una paraula bloquejada. Llegeix la llista al servidor abans de canviar-la,
 * perquè la comuna la poden editar altres usuaris alhora. En moure, primer s'afegeix a la zona nova i després es
 * treu de l'antiga: si falla a mig camí, la paraula queda a les dues zones, mai a cap.
 */
export async function editBlockedWord(word: string, action: BlockedAction, zone: BlockedZone): Promise<string | null> {
  const w = String(word).trim().toLowerCase();
  if (w.length < 2 || w.length > 40) return "La paraula ha de tenir entre 2 i 40 caràcters.";
  if (!ACTIONS.includes(action) || !ZONES.includes(zone)) return "Valor no vàlid.";
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return SESSION_EXPIRED;
  const error = action === "remove"
    ? await removeFrom(supabase, userId, zone, w)
    : (await addTo(supabase, userId, zone, w))
      ?? (action === "move" ? await removeFrom(supabase, userId, zone === "common" ? "personal" : "common", w) : null);
  if (!error) revalidatePath("/", "layout");
  return error;
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
