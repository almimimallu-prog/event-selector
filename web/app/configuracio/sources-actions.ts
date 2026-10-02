"use server";

import { revalidatePath } from "next/cache";
import { findMunicipality } from "@/lib/municipis";
import { USER_AGENT, robotsAllows } from "@/lib/robots";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./zones-actions";

const TIMEOUT_MS = 15_000;

async function fetchText(url: string): Promise<{ status: number; text: string; type: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  return { status: res.status, text: res.ok ? await res.text() : "", type: res.headers.get("content-type") ?? "" };
}

function pageTitle(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1];
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  const text = (og ?? title)?.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 80) : null;
}

/**
 * Tria l'adaptador més barat que funcioni: The Events Calendar (API de WordPress) o schema.org/Event a la pàgina
 * llegeixen dades estructurades; si no, Gemini llegeix la pàgina (gasta quota).
 */
async function detectAdapter(url: string, html: string): Promise<"tribe" | "jsonld" | "llm"> {
  try {
    const api = `${new URL(url).origin}/wp-json/tribe/events/v1/events?per_page=1`;
    const res = await fetchText(api);
    if (res.status === 200 && res.type.includes("json") && JSON.parse(res.text).events) return "tribe";
  } catch {
    // No és un WordPress amb The Events Calendar.
  }
  if (/"@type"\s*:\s*"(\w*Event)"/.test(html) && /application\/ld\+json/i.test(html)) return "jsonld";
  return "llm";
}

/** '@compte' o 'https://www.instagram.com/compte/' → 'compte' (com adapters/instagram.py). */
function instagramHandle(text: string): string | null {
  const m = text.match(/instagram\.com\/([A-Za-z0-9_.]+)/) ?? text.match(/^@([A-Za-z0-9_.]{1,30})$/);
  if (!m || ["p", "reel", "reels", "stories", "explore"].includes(m[1])) return null;
  return m[1].toLowerCase();
}

export async function addSource(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await createClient();
  // Abans de fer cap petició a webs externes: només amb sessió iniciada.
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return { status: "error", message: "La sessió ha caducat. Torna a entrar." };
  const raw = String(form.get("url") ?? "").trim();
  const cityInput = String(form.get("city") ?? "").trim();
  const city = cityInput ? findMunicipality(cityInput) : undefined;
  if (cityInput && !city) return { status: "error", message: "No trobo aquest municipi. Tria'l de la llista o deixa-ho buit." };

  // Instagram: API oficial de Meta (Business Discovery) des del pipeline; només comptes professionals.
  const handle = instagramHandle(raw);
  if (handle) {
    const label = String(form.get("name") ?? "").trim();
    const { error } = await supabase.from("sources").insert({
      name: `Instagram: @${handle}${label ? ` (${label})` : ""}`,
      type: "instagram",
      handle,
      url: `https://www.instagram.com/${handle}/`,
      config: { adapter: "instagram" },
      schedule_hours: 12,
      default_city: city?.name ?? null,
      discovered_via: "manual",
    });
    if (error) return { status: "error", message: error.code === "23505" ? "Ja segueixes aquest compte." : error.message };
    revalidatePath("/configuracio");
    return { status: "ok", message: `@${handle} afegit. Si no és un compte professional, ho veuràs com a error a la llista.` };
  }

  let url: URL;
  try {
    url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) throw new Error();
  } catch {
    return { status: "error", message: "Escriu un enllaç complet (https://…) o un compte d'Instagram (@compte)." };
  }

  // Eventbrite: el web prohibeix la lectura automàtica; es fa servir l'API oficial, que necessita el token
  // del pipeline. Es desa l'enllaç i el pipeline en busca l'organitzador a la propera execució.
  if (/(^|\.)eventbrite\.[a-z.]+$/.test(url.hostname)) {
    if (!/\/(o|e)\/[^?#]*\d{6,}/.test(url.pathname)) {
      return { status: "error", message: "Enganxa l'enllaç d'un esdeveniment (/e/…) o d'un organitzador (/o/…) d'Eventbrite." };
    }
    const { error } = await supabase.from("sources").insert({
      name: "Eventbrite (pendent: es completarà a la propera actualització)",
      type: "api",
      url: url.href,
      config: { adapter: "eventbrite", pending_url: url.href },
      schedule_hours: 24,
      discovered_via: "manual",
    });
    if (error) return { status: "error", message: error.code === "23505" ? "Ja tens aquesta font." : error.message };
    revalidatePath("/configuracio");
    return { status: "ok", message: "Font d'Eventbrite afegida. Se seguirà l'organitzador a partir de la propera actualització." };
  }

  try {
    const robots = await fetchText(`${url.origin}/robots.txt`);
    if (robots.status === 200 && !robotsAllows(robots.text, url.href)) {
      return { status: "error", message: "Aquest web demana no ser llegit automàticament (robots.txt). No l'afegeixo." };
    }
  } catch {
    // Sense robots.txt accessible: es considera permès.
  }
  let html: string;
  try {
    const page = await fetchText(url.href);
    if (page.status !== 200) return { status: "error", message: `La pàgina respon amb un error (${page.status}).` };
    html = page.text;
  } catch {
    return { status: "error", message: "No s'ha pogut obrir la pàgina (no respon o tarda massa)." };
  }

  const adapter = await detectAdapter(url.href, html);
  const name = String(form.get("name") ?? "").trim() || pageTitle(html) || url.hostname;
  const { error } = await supabase.from("sources").insert({
    name,
    type: adapter === "llm" ? "web" : "api",
    url: url.href,
    config: { adapter },
    schedule_hours: 24,
    default_city: city?.name ?? null,
    discovered_via: "manual",
  });
  if (error) return { status: "error", message: error.code === "23505" ? "Ja tens aquesta font." : error.message };
  revalidatePath("/configuracio");
  const how = adapter === "llm" ? "Gemini llegirà la pàgina" : "té dades estructurades, no gasta quota de Gemini";
  return { status: "ok", message: `«${name}» afegida (${how}). Els esdeveniments arribaran a la propera actualització.` };
}

export async function setSourceActive(id: string, active: boolean): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sources")
    .update(active ? { status: "active", next_run_at: new Date().toISOString() } : { status: "paused" })
    .eq("id", id);
  if (error) return error.message;
  revalidatePath("/configuracio");
  return null;
}

export async function deleteSource(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("sources").select("discovered_via").eq("id", id).maybeSingle();
  // Les fonts llavor es tornen a crear a cada execució del pipeline: només es poden pausar.
  if (data?.discovered_via === "seed") return "Aquesta font ve de sèrie: la pots pausar, però no esborrar.";
  const { error } = await supabase.from("sources").delete().eq("id", id);
  if (error) return error.message;
  revalidatePath("/configuracio");
  return null;
}
