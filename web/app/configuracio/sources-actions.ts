"use server";

import { revalidatePath } from "next/cache";
import { findMunicipality } from "@/lib/municipis";
import { USER_AGENT, robotsAllows } from "@/lib/robots";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/geo-actions";

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

type LumaEntity = { api_id?: string; name?: string; is_personal?: boolean };
type LumaPage = { place?: LumaEntity; calendar?: LumaEntity; event?: LumaEntity };

/**
 * Luma: cada calendari i cada pàgina de ciutat té un calendari .ics públic (el que llegeix el pipeline).
 * Pàgina de ciutat (luma.com/barcelona) → els plans de la ciutat; calendari (luma.com/nom) → el calendari;
 * pla (luma.com/abc123) → el calendari de qui l'organitza. Les dades són a __NEXT_DATA__ de la pàgina.
 */
async function lumaCalendar(href: string): Promise<{ ics: string; name: string } | null> {
  const page = await fetchText(href);
  const json = page.text.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (page.status !== 200 || !json) return null;
  let data: LumaPage | undefined;
  try {
    data = JSON.parse(json)?.props?.pageProps?.initialData?.data;
  } catch {
    return null;
  }
  const ics = (entity: string, id: string) => `https://api.luma.com/ics/get?entity=${entity}&id=${encodeURIComponent(id)}`;
  if (data?.place?.api_id?.startsWith("discplace-")) {
    return { ics: ics("discover", data.place.api_id), name: `Luma: ${data.place.name ?? "ciutat"}` };
  }
  const calendar = data?.calendar;
  if (!calendar?.api_id?.startsWith("cal-")) return null;
  const personal = calendar.is_personal || !calendar.name || calendar.name === "Personal";
  const name = !personal ? calendar.name : data?.event?.name ? `organitzador de «${data.event.name.slice(0, 50)}»` : "calendari personal";
  return { ics: ics("calendar", calendar.api_id), name: `Luma: ${name}` };
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
  const categoryInput = String(form.get("category") ?? "");
  const defaultCategory = ["cultura", "esport_natura", "formacio_tech", "gastronomia_social", "dating"].includes(categoryInput)
    ? { default_category: categoryInput }
    : {};
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
    url = new URL(raw.replace(/^webcal:/i, "https:")); // webcal:// = calendari per subscriure-s'hi
    if (!/^https?:$/.test(url.protocol)) throw new Error();
  } catch {
    return { status: "error", message: "Escriu un enllaç complet (https://…) o un compte d'Instagram (@compte)." };
  }

  // Meetup: la seva API és només per a Meetup Pro; es llegeix el calendari iCal públic del grup.
  if (/(^|\.)meetup\.com$/.test(url.hostname)) {
    const group = url.pathname.match(/^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?([A-Za-z0-9_-]+)/)?.[1];
    if (!group || ["find", "topics", "cities", "login", "register", "apps", "pro", "blog", "lp", "help"].includes(group)) {
      return { status: "error", message: "Enganxa l'enllaç d'un grup de Meetup (meetup.com/nom-del-grup/)." };
    }
    url = new URL(`https://www.meetup.com/${group}/events/ical/`);
  }

  // Luma: es desa el calendari .ics de la pàgina (ciutat, calendari o organitzador d'un pla). Sense Gemini.
  let lumaName: string | undefined;
  if (/(^|\.)(luma\.com|lu\.ma)$/.test(url.hostname) && url.hostname !== "api.luma.com") {
    let luma: Awaited<ReturnType<typeof lumaCalendar>> = null;
    try {
      luma = await lumaCalendar(url.href);
    } catch {
      return { status: "error", message: "No s'ha pogut obrir la pàgina de Luma (no respon o tarda massa)." };
    }
    if (!luma) {
      return { status: "error", message: "No trobo el calendari d'aquesta pàgina de Luma. Enganxa l'enllaç d'una ciutat (luma.com/barcelona), d'un calendari o d'un pla." };
    }
    url = new URL(luma.ics);
    lumaName = luma.name;
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
      config: { adapter: "eventbrite", pending_url: url.href, ...defaultCategory },
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
  let isCalendar = false;
  try {
    const page = await fetchText(url.href);
    if (page.status !== 200) return { status: "error", message: `La pàgina respon amb un error (${page.status}).` };
    html = page.text;
    isCalendar = page.type.includes("calendar") || html.trimStart().startsWith("BEGIN:VCALENDAR");
  } catch {
    return { status: "error", message: "No s'ha pogut obrir la pàgina (no respon o tarda massa)." };
  }

  // Calendari .ics (Meetup o qualsevol altre): dades estructurades, sense Gemini.
  const calendarName = isCalendar ? html.match(/^X-WR-CALNAME:(.+)$/m)?.[1]?.trim() : undefined;
  const adapter = isCalendar ? "ics" : await detectAdapter(url.href, html);
  const name = String(form.get("name") ?? "").trim() || lumaName
    || (isCalendar ? `${url.hostname.endsWith("meetup.com") ? "Meetup" : "Calendari"}: ${calendarName ?? url.hostname}` : pageTitle(html))
    || url.hostname;
  const { error } = await supabase.from("sources").insert({
    name,
    type: adapter === "llm" ? "web" : adapter === "ics" ? "ics" : "api",
    url: url.href,
    config: { adapter, ...defaultCategory },
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
  let values: Record<string, unknown> = { status: "paused" };
  if (active) {
    // En reactivar-la, la pausa automàtica (pipeline/event_pipeline/idle.py) torna a comptar des d'ara.
    const { data } = await supabase.from("sources").select("config").eq("id", id).maybeSingle();
    const config = Object.fromEntries(Object.entries((data?.config ?? {}) as Record<string, unknown>)
      .filter(([key]) => key !== "auto_paused_at" && key !== "auto_paused_reason"));
    const now = new Date().toISOString();
    values = { status: "active", next_run_at: now, config: { ...config, active_since: now } };
  }
  const { error } = await supabase.from("sources").update(values).eq("id", id);
  if (error) return error.message;
  revalidatePath("/configuracio");
  return null;
}

// ─── «Fonts proposades» (el pipeline les troba seguint les @mencions dels comptes que segueixes) ───

async function setProposalStatus(id: string, status: "active" | "rejected"): Promise<string | null> {
  const supabase = await createClient();
  const values = status === "active" ? { status, next_run_at: new Date().toISOString() } : { status };
  const { error } = await supabase.from("sources").update(values).eq("id", id).eq("status", "proposed");
  if (error) return error.message;
  revalidatePath("/configuracio");
  return null;
}

/** Segueix el compte d'Instagram proposat: es llegirà a la propera actualització. */
export async function followProposal(id: string): Promise<string | null> {
  return setProposalStatus(id, "active");
}

/** No el vull: no es tornarà a proposar. */
export async function dismissProposal(id: string): Promise<string | null> {
  return setProposalStatus(id, "rejected");
}

/** Afegeix el web del compte proposat (amb les comprovacions de sempre) i treu la proposta de la safata. */
export async function addProposalWebsite(id: string, website: string): Promise<FormState> {
  const form = new FormData();
  form.set("url", website.trim());
  const result = await addSource({ status: "idle" }, form);
  if (result.status !== "ok") return result;
  const error = await setProposalStatus(id, "rejected");
  return error ? { status: "error", message: error } : result;
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
