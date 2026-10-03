"use client";

import { CalendarPlus, CheckCircle2, ChevronDown, Clock, ChevronLeft, ChevronRight, Euro, MapPin, Plus, Search, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CATEGORIES, DISMISS_REASONS } from "@/lib/categories";
import { MONTHS_SHORT, WEEKDAYS_SHORT, addDays, dayLabel, local } from "@/lib/dates";
import { googleCalendarUrl } from "@/lib/links";
import { zoneLabel } from "@/lib/zones";
import { score as computeScore, isBlocked, type Score } from "@/lib/ranking";
import type { AppEvent, Category, Prefs, Zone } from "@/lib/types";
import { AppNav, Brand } from "./app-nav";
import { EventDetail } from "./event-detail";
import { EventRow } from "./event-row";
import { GeoEditor } from "./geo-editor";
import { type Hours, HoursPanel, hoursLabel } from "./hours-filter";
import { useMarks } from "./use-marks";

// Filtres ràpids de la pantalla principal: es recorden en aquest navegador.
type QuickFilters = { off: Category[]; free: boolean; hours: Hours | null };
const NO_FILTERS: QuickFilters = { off: [], free: false, hours: null };
const FILTERS_KEY = "filtres-rapids";

// Lectura amb useSyncExternalStore: al servidor (i en el primer pintat) no hi ha filtres.
const FILTERS_EVENT = "filtres-rapids";
function subscribeFilters(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(FILTERS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(FILTERS_EVENT, onChange);
  };
}
function filtersSnapshot(): string {
  try {
    return localStorage.getItem(FILTERS_KEY) ?? "{}";
  } catch {
    return memoryFilters;
  }
}
let memoryFilters = "{}"; // sense emmagatzematge (navegació privada): val fins que es tanqui la pàgina

function saveFilters(next: QuickFilters) {
  memoryFilters = JSON.stringify(next);
  try {
    localStorage.setItem(FILTERS_KEY, memoryFilters);
  } catch {
    // Sense emmagatzematge: es fa servir memoryFilters.
  }
  window.dispatchEvent(new Event(FILTERS_EVENT));
}

function parseFilters(raw: string): QuickFilters {
  try {
    return { ...NO_FILTERS, ...JSON.parse(raw) };
  } catch {
    return NO_FILTERS;
  }
}

function passesQuick(e: AppEvent, f: QuickFilters): boolean {
  if (f.off.includes(e.category)) return false;
  if (f.free && !(e.is_free || e.price_min === 0)) return false;
  // Franja horària: per l'hora d'inici; els de tot el dia, exposicions i cursos sempre passen.
  if (f.hours && !e.all_day && e.kind === "session") {
    const l = local(e.start_at);
    const hour = l.hour + l.minute / 60;
    if (hour < f.hours[0] || hour >= f.hours[1]) return false;
  }
  return true;
}

// Quants suggeriments es mostren d'entrada (la resta, amb "Veure'n més"). Els plans propis sempre surten.
const FIRST_CALENDAR = 15;
const FIRST_LIST = 20;

// Punts de densitat: suggeriments amb aquesta puntuació o més (màxim 3 punts per dia).
const DENSITY_SCORE = 70;

type CalendarProps = { mode: "calendar"; weekStart: string; initialDay: string };
type ListProps = { mode: "list"; title: string; emptyText: string; sort: "score" | "date" };
type Props = (CalendarProps | ListProps) & {
  events: AppEvent[];
  prefs: Prefs;
  zones: Zone[];
  demo?: boolean;
};

const isMine = (e: AppEvent) => e.user_state === "going" || e.user_state === "interested";

export function EventBrowser(props: Props) {
  const { prefs, zones, demo } = props;
  const router = useRouter();
  const { events, toggle, dismiss, setNote, error } = useMarks(props.events, demo);
  const [day, setDay] = useState(props.mode === "calendar" ? props.initialDay : "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [geoOpen, setGeoOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [expandedFor, setExpandedFor] = useState<string | null>(null); // dia (o llista) amb "Veure'n més" obert
  const [query, setQuery] = useState("");
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const [showDetail, setShowDetail] = useState(false); // mòbil: la fitxa substitueix la llista
  const [askCalendar, setAskCalendar] = useState(false); // mòbil: lliscar a la dreta a la fitxa
  const rawFilters = useSyncExternalStore(subscribeFilters, filtersSnapshot, () => "{}");
  const filters = useMemo(() => parseFilters(rawFilters), [rawFilters]);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const setFilters = saveFilters;

  const scores = useMemo(() => {
    const now = new Date();
    return new Map<string, Score>(events.map((e) => [e.id, computeScore(e, prefs, zones, now)]));
  }, [events, prefs, zones]);

  // Els plans propis (⭐ ✅) sempre surten; els filtres ràpids i les paraules bloquejades només afecten la resta.
  const { visible, hiddenByFilters } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = events.filter(
      (e) =>
        e.user_state !== "dismissed" &&
        (!q || [e.title, e.venue_name, e.city, ...e.tags].join(" ").toLowerCase().includes(q)) &&
        (isMine(e) || !isBlocked(e, prefs.blocked_tags)),
    );
    const shown = base.filter((e) => isMine(e) || passesQuick(e, filters));
    const shownIds = new Set(shown.map((e) => e.id));
    return { visible: shown, hiddenByFilters: base.filter((e) => !shownIds.has(e.id)) };
  }, [events, query, filters, prefs.blocked_tags]);
  const filtersOn = filters.off.length > 0 || filters.free || filters.hours != null;

  const byDay = useMemo(() => {
    const map = new Map<string, AppEvent[]>();
    for (const e of visible) {
      const key = local(e.start_at).key;
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [visible]);

  const ordered = useMemo(() => {
    const pool = props.mode === "calendar" ? (byDay.get(day) ?? []) : visible;
    const plans = pool.filter(isMine).sort((a, b) =>
      (a.user_state === "going" ? 0 : 1) - (b.user_state === "going" ? 0 : 1) || a.start_at.localeCompare(b.start_at));
    const rest = pool.filter((e) => !isMine(e));
    if (props.mode === "list" && props.sort === "date") rest.sort((a, b) => a.start_at.localeCompare(b.start_at));
    else rest.sort((a, b) => scores.get(b.id)!.total - scores.get(a.id)!.total);
    const limit = props.mode === "calendar" ? FIRST_CALENDAR : props.sort === "date" ? Infinity : FIRST_LIST;
    const shown = expandedFor === (props.mode === "calendar" ? day : "list") ? rest : rest.slice(0, limit);
    return { plans, rest: shown, more: rest.length - shown.length, all: [...plans, ...shown] };
  }, [props, byDay, day, visible, scores, expandedFor]);

  const selected = ordered.all.find((e) => e.id === selectedId) ?? (showDetail ? null : ordered.all[0] ?? null);
  const selectedIndex = selected ? ordered.all.indexOf(selected) : -1;

  function select(id: string | null, openOnMobile = true) {
    setSelectedId(id);
    setReasonsOpen(false);
    if (openOnMobile) openDetail();
  }

  // Mòbil: obrir la fitxa afegeix una entrada a l'historial perquè el gest "enrere" d'Android torni a la llista.
  function openDetail() {
    if (!showDetail && window.matchMedia("(max-width: 767px)").matches) window.history.pushState({ fitxa: true }, "");
    setShowDetail(true);
  }

  function closeDetail() {
    if (window.history.state?.fitxa) window.history.back(); // el popstate tanca la fitxa
    else setShowDetail(false);
  }

  useEffect(() => {
    const onPop = () => { if (!window.history.state?.fitxa) { setShowDetail(false); setAskCalendar(false); } };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function goDay(key: string) {
    if (props.mode !== "calendar") return;
    const weekEnd = addDays(props.weekStart, 6);
    if (key < props.weekStart || key > weekEnd) {
      router.push(`/?week=${key}`);
      return;
    }
    setDay(key);
    setSelectedId(null);
    setReasonsOpen(false);
    listRef.current?.scrollTo({ top: 0 });
  }

  // Dreceres de teclat (escriptori).
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const target = ev.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        if (ev.key === "Escape") target.blur();
        return;
      }
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const current = selected;
      if (reasonsOpen && current && /^[1-5]$/.test(ev.key)) {
        dismiss(current, DISMISS_REASONS[Number(ev.key) - 1].key);
        setReasonsOpen(false);
        return;
      }
      const move = (delta: number) => {
        const next = ordered.all[Math.max(0, Math.min(ordered.all.length - 1, selectedIndex + delta))];
        if (next) select(next.id, false);
      };
      switch (ev.key) {
        case "ArrowLeft": if (props.mode === "calendar") goDay(addDays(day, -1)); break;
        case "ArrowRight": if (props.mode === "calendar") goDay(addDays(day, 1)); break;
        case "ArrowDown": move(1); break;
        case "ArrowUp": move(-1); break;
        case "s": case "S": if (current) toggle(current, "interested"); break;
        case "a": case "A": if (current) toggle(current, "going"); break;
        case "x": case "X": if (current) setReasonsOpen((o) => !o); break;
        case "g": case "G": document.querySelector<HTMLAnchorElement>("a[data-gcal]")?.click(); break;
        case "/": searchRef.current?.focus(); break;
        case "Escape": setReasonsOpen(false); if (showDetail) closeDetail(); break;
        default: return;
      }
      ev.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // La fila seleccionada sempre visible.
  useEffect(() => {
    listRef.current?.querySelector("[data-selected]")?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  // Gest lateral sobre la llista: canviar de dia.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => (swipe.current = { x: e.clientX, y: e.clientY });
  const onPointerUp = (e: React.PointerEvent) => {
    if (!swipe.current || props.mode !== "calendar") return;
    const dx = e.clientX - swipe.current.x;
    const dy = e.clientY - swipe.current.y;
    swipe.current = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) goDay(addDays(day, dx < 0 ? 1 : -1));
  };

  // Gest lateral sobre la fitxa (mòbil): a l'esquerra torna a la llista; a la dreta pregunta si s'afegeix a Google Calendar.
  const onDetailPointerDown = (e: React.PointerEvent) => (swipe.current = { x: e.clientX, y: e.clientY });
  const onDetailPointerUp = (e: React.PointerEvent) => {
    if (!swipe.current || !showDetail) return;
    const dx = e.clientX - swipe.current.x;
    const dy = e.clientY - swipe.current.y;
    swipe.current = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5 && window.matchMedia("(max-width: 767px)").matches) {
      if (dx < 0) closeDetail();
      else if (selected) setAskCalendar(true);
    }
  };

  const nearby = selected && selected.kind === "session"
    ? (byDay.get(local(selected.start_at).key) ?? [])
        .filter((e) => e.id !== selected.id && e.city && e.city === selected.city)
        .sort((a, b) => scores.get(b.id)!.total - scores.get(a.id)!.total)
        .slice(0, 3)
    : [];

  const listTitle = props.mode === "calendar" ? dayLabel(day) : props.title;
  const hiddenHere = props.mode === "calendar"
    ? hiddenByFilters.filter((e) => local(e.start_at).key === day).length
    : hiddenByFilters.length;

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col px-4 pb-20 md:h-dvh md:pb-3">
      <header className="flex flex-col gap-3 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Brand />
          <AppNav />
          <button type="button" aria-expanded={geoOpen} onClick={() => setGeoOpen((o) => !o)}
                  title="Municipis i radi"
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-transparent bg-accent-soft px-3 py-1 text-[13px] font-medium text-accent">
            <MapPin size={14} className="shrink-0" aria-hidden />
            <span className="truncate">{zones.filter((z) => z.active).map(zoneLabel).join(" · ") || "Tria un municipi"}</span>
            <ChevronDown size={14} className={`shrink-0 transition-transform ${geoOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          <label className="flex min-w-0 flex-1 basis-full items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 md:ml-auto md:max-w-72 md:basis-auto">
            <Search size={17} className="text-fg-3" />
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
                   placeholder="Cerca: jazz, excursió, taller…" aria-label="Cerca"
                   className="w-full min-w-0 bg-transparent text-sm outline-none" />
            <kbd className="hidden rounded border border-b-2 border-line px-1 text-[11px] text-fg-2 md:inline">/</kbd>
          </label>
        </div>

        {geoOpen && (
          <div className="rounded-2xl border border-line bg-surface px-4 py-1">
            <GeoEditor zones={zones.filter((z) => z.active)} />
          </div>
        )}

        {/* Filtres ràpids: categories, gratis i franja horària. */}
        <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]" role="group" aria-label="Filtres ràpids">
          {(Object.keys(CATEGORIES) as Category[]).map((c) => {
            const { label, icon: Icon, text, soft } = CATEGORIES[c];
            const on = !filters.off.includes(c);
            return (
              <button key={c} type="button" aria-pressed={on} title={on ? `Amagar ${label}` : `Mostrar ${label}`}
                      onClick={() => setFilters({ ...filters, off: on ? [...filters.off, c] : filters.off.filter((x) => x !== c) })}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-medium ${on ? `border-transparent ${soft} ${text}` : "border-line bg-surface text-fg-3 line-through"}`}>
                <Icon size={14} aria-hidden /> <span className="hidden sm:inline">{label}</span>
                <span className="sr-only sm:hidden">{label}</span>
              </button>
            );
          })}
          <button type="button" aria-pressed={filters.free} onClick={() => setFilters({ ...filters, free: !filters.free })}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-medium ${filters.free ? "border-transparent bg-accent text-surface" : "border-line bg-surface text-fg-2"}`}>
            <Euro size={14} aria-hidden /> Gratis
          </button>
          <button type="button" aria-expanded={hoursOpen} onClick={() => setHoursOpen((o) => !o)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-medium tabular-nums ${filters.hours ? "border-transparent bg-accent text-surface" : "border-line bg-surface text-fg-2"}`}>
            <Clock size={14} aria-hidden /> {hoursLabel(filters.hours)}
            <ChevronDown size={13} className={`transition-transform ${hoursOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {filtersOn && (
            <button type="button" onClick={() => setFilters(NO_FILTERS)}
                    className="shrink-0 px-1.5 text-[13px] font-medium text-accent underline">
              Treure filtres
            </button>
          )}
        </div>

        {hoursOpen && <HoursPanel value={filters.hours} onChange={(hours) => setFilters({ ...filters, hours })} />}

        {props.mode === "calendar" && (
          <div className="flex items-stretch gap-2">
            <button type="button" aria-label="Setmana anterior" onClick={() => router.push(`/?week=${addDays(props.weekStart, -7)}`)}
                    className="grid w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface text-fg-2">
              <ChevronLeft size={18} />
            </button>
            <div className="grid flex-1 grid-cols-7 gap-1 md:gap-1.5">
              {Array.from({ length: 7 }, (_, i) => {
                const key = addDays(props.weekStart, i);
                const dayEvents = byDay.get(key) ?? [];
                const going = dayEvents.filter((e) => e.user_state === "going").length;
                const starred = dayEvents.filter((e) => e.user_state === "interested").length;
                const dots = Math.min(3, dayEvents.filter((e) => !isMine(e) && scores.get(e.id)!.total >= DENSITY_SCORE).length);
                const on = key === day;
                const [, m, d] = key.split("-").map(Number);
                return (
                  <button key={key} type="button" onClick={() => goDay(key)} aria-pressed={on}
                          aria-label={`${dayLabel(key)}, ${dayEvents.length} esdeveniments`}
                          className={`flex flex-col items-center gap-0.5 rounded-lg border px-0.5 py-1.5 text-xs ${on ? "border-accent bg-accent text-surface" : "border-line bg-surface text-fg-2"}`}>
                    <span>{WEEKDAYS_SHORT[i]}</span>
                    <b className={`font-display text-lg leading-none font-medium md:text-[22px] ${on ? "" : "text-fg"}`}>{d}</b>
                    <span className="flex h-4 items-center gap-0.5">
                      {going > 0 && <CheckCircle2 size={14} className={on ? "" : "text-going"} />}
                      {starred > 0 && <Star size={14} className={on ? "fill-current" : "fill-star text-star"} />}
                    </span>
                    <span className="flex h-1.5 gap-0.5">
                      {Array.from({ length: dots }, (_, j) => <i key={j} className={`size-1.5 rounded-full ${on ? "bg-surface" : "bg-accent"}`} />)}
                    </span>
                    <small className={`hidden text-[11px] tabular-nums md:block ${on ? "" : "text-fg-3"}`}>
                      {dayEvents.length} {i === 0 ? MONTHS_SHORT[m - 1] : ""}
                    </small>
                  </button>
                );
              })}
            </div>
            <button type="button" aria-label="Setmana següent" onClick={() => router.push(`/?week=${addDays(props.weekStart, 7)}`)}
                    className="grid w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface text-fg-2">
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </header>

      {error && <p className="mb-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">{error}</p>}

      <main className="grid min-h-0 flex-1 gap-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <section aria-label={listTitle}
                 className={`min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface ${showDetail ? "hidden md:flex" : "flex"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 pt-3.5 pb-2.5">
            <h1 className="flex items-center gap-2 font-display text-xl font-medium">
              {listTitle}
              <Link href="/plans/nou" title="Afegir un pla a mà" aria-label="Afegir un pla a mà"
                    className="inline-flex items-center gap-0.5 rounded-full border border-line px-2 py-0.5 font-sans text-xs font-medium text-accent hover:bg-surface-2">
                <Plus size={13} /> Afegir
              </Link>
            </h1>
            <span className="text-[13px] text-fg-3 tabular-nums">
              {ordered.all.length + ordered.more} esdeveniments · {props.mode === "list" && props.sort === "date" ? "per data" : "per puntuació"}
              {hiddenHere > 0 && <> · {hiddenHere} amagats pels filtres</>}
            </span>
          </div>
          <div ref={listRef} onPointerDown={onPointerDown} onPointerUp={onPointerUp}
               className="flex-1 touch-pan-y overflow-y-auto">
            {ordered.all.length === 0 && (
              <p className="px-5 py-10 text-center text-fg-3">
                {props.mode === "list" ? props.emptyText : "Cap esdeveniment aquest dia amb aquests filtres."}
              </p>
            )}
            {ordered.plans.length > 0 && <SectionLabel>Els teus plans</SectionLabel>}
            {ordered.plans.map((e) => (
              <EventRow key={e.id} event={e} score={scores.get(e.id)!.total} selected={e.id === selected?.id}
                        onSelect={() => select(e.id)} withDate={props.mode === "list"} />
            ))}
            {ordered.rest.length > 0 && <SectionLabel>{props.mode === "calendar" ? "Suggeriments" : "Tots"}</SectionLabel>}
            {ordered.rest.map((e) => (
              <EventRow key={e.id} event={e} score={scores.get(e.id)!.total} selected={e.id === selected?.id}
                        onSelect={() => select(e.id)} withDate={props.mode === "list"} />
            ))}
            {ordered.more > 0 && (
              <button type="button" onClick={() => setExpandedFor(props.mode === "calendar" ? day : "list")}
                      className="mx-4 my-3 w-[calc(100%-2rem)] rounded-lg border border-line py-2.5 text-sm font-medium text-accent hover:bg-surface-2">
                Veure&apos;n {ordered.more} més
              </button>
            )}
            {props.mode === "calendar" && ordered.all.length > 0 && (
              <p className="p-4 text-center text-[13px] text-fg-3">Final del dia · llisca o prem → per anar al dia següent</p>
            )}
          </div>
        </section>

        <aside aria-label="Fitxa de l'esdeveniment" onPointerDown={onDetailPointerDown} onPointerUp={onDetailPointerUp}
               className={`min-h-0 touch-pan-y overflow-y-auto rounded-2xl border border-line bg-surface ${showDetail ? "block" : "hidden md:block"}`}>
          <EventDetail event={selected} score={selected ? scores.get(selected.id)! : null} nearby={nearby}
                       onToggle={toggle} onDismiss={(e, r) => { dismiss(e, r); setReasonsOpen(false); }} onNote={setNote}
                       onSelect={(id) => select(id)} onBack={closeDetail}
                       reasonsOpen={reasonsOpen} setReasonsOpen={setReasonsOpen} demo={demo} />
        </aside>
      </main>

      {askCalendar && selected && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-3 md:hidden" onClick={() => setAskCalendar(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="ask-calendar"
               className="w-full rounded-2xl bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <p id="ask-calendar" className="font-semibold">Vols afegir-lo al teu Google Calendar?</p>
            <p className="mt-1 text-sm text-fg-2">{selected.title}</p>
            <div className="mt-4 grid gap-2">
              <a href={googleCalendarUrl(selected)} target="_blank" rel="noopener noreferrer" onClick={() => setAskCalendar(false)}
                 className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-accent font-semibold text-surface">
                <CalendarPlus size={17} /> Sí, afegir a Google Calendar
              </a>
              {isMine(selected) ? (
                <p className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-warn-bg text-sm font-medium text-warn-fg">
                  <Star size={17} className="fill-current" /> Ja és a la teva llista
                </p>
              ) : (
                <button type="button" onClick={() => { toggle(selected, "interested"); setAskCalendar(false); }}
                        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface font-semibold">
                  <Star size={17} /> Guardar a «M&apos;interessa»
                </button>
              )}
              <button type="button" onClick={() => setAskCalendar(false)}
                      className="h-11 rounded-lg font-medium text-fg-2">
                No, gràcies
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="hidden flex-wrap justify-center gap-3.5 pt-2.5 text-xs text-fg-3 md:flex">
        {props.mode === "calendar" && <span>← → dia</span>}
        <span>↑ ↓ llista</span><span>S m&apos;interessa</span><span>A hi vaig</span><span>X descartar</span>
        <span>G Google Calendar</span><span>/ cercar</span>
      </footer>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pt-3 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase">{children}</div>;
}
