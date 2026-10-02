"use client";

import { CheckCircle2, ChevronLeft, ChevronRight, House, MapPin, Search, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DISMISS_REASONS } from "@/lib/categories";
import { MONTHS_SHORT, WEEKDAYS_SHORT, addDays, dayLabel, local } from "@/lib/dates";
import { LOCAL_COOKIE, LOCAL_RADIUS_KM, homeZone, isNearHome, ofPlace } from "@/lib/local-mode";
import { score as computeScore, type Score } from "@/lib/ranking";
import type { AppEvent, Prefs, Zone } from "@/lib/types";
import { AppNav, Brand } from "./app-nav";
import { EventDetail } from "./event-detail";
import { EventRow } from "./event-row";
import { useMarks } from "./use-marks";

// Punts de densitat: suggeriments amb aquesta puntuació o més (màxim 3 punts per dia).
const DENSITY_SCORE = 70;

type CalendarProps = { mode: "calendar"; weekStart: string; initialDay: string };
type ListProps = { mode: "list"; title: string; emptyText: string; sort: "score" | "date" };
type Props = (CalendarProps | ListProps) & {
  events: AppEvent[];
  prefs: Prefs;
  zones: Zone[];
  /** Mode "Sense sortir d'Igualada" (llegit de la galeta al servidor). */
  initialLocalOnly?: boolean;
  demo?: boolean;
};

const isMine = (e: AppEvent) => e.user_state === "going" || e.user_state === "interested";

export function EventBrowser(props: Props) {
  const { prefs, zones, demo } = props;
  const router = useRouter();
  const { events, toggle, dismiss, setNote, error } = useMarks(props.events, demo);
  const [day, setDay] = useState(props.mode === "calendar" ? props.initialDay : "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoneOff, setZoneOff] = useState<Set<string>>(new Set());
  const [localOnly, setLocalOnly] = useState(!!props.initialLocalOnly);
  const home = homeZone(zones);
  const [query, setQuery] = useState("");
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const [showDetail, setShowDetail] = useState(false); // mòbil: la fitxa substitueix la llista
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const scores = useMemo(() => {
    const now = new Date();
    return new Map<string, Score>(events.map((e) => [e.id, computeScore(e, prefs, zones, now)]));
  }, [events, prefs, zones]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter(
      (e) =>
        e.user_state !== "dismissed" &&
        (localOnly && home ? isNearHome(e, home) : !(e.zone_name && zoneOff.has(e.zone_name))) &&
        (!q || [e.title, e.venue_name, e.city, ...e.tags].join(" ").toLowerCase().includes(q)),
    );
  }, [events, query, zoneOff, localOnly, home]);

  function toggleLocalOnly() {
    const next = !localOnly;
    setLocalOnly(next);
    setSelectedId(null);
    document.cookie = next
      ? `${LOCAL_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
      : `${LOCAL_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }

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
    return { plans, rest, all: [...plans, ...rest] };
  }, [props, byDay, day, visible, scores]);

  const selected = ordered.all.find((e) => e.id === selectedId) ?? (showDetail ? null : ordered.all[0] ?? null);
  const selectedIndex = selected ? ordered.all.indexOf(selected) : -1;

  function select(id: string | null, openOnMobile = true) {
    setSelectedId(id);
    setReasonsOpen(false);
    if (openOnMobile) setShowDetail(true);
  }

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
        case "Escape": setReasonsOpen(false); setShowDetail(false); break;
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

  const nearby = selected && selected.kind === "session"
    ? (byDay.get(local(selected.start_at).key) ?? [])
        .filter((e) => e.id !== selected.id && e.city && e.city === selected.city)
        .sort((a, b) => scores.get(b.id)!.total - scores.get(a.id)!.total)
        .slice(0, 3)
    : [];

  const listTitle = props.mode === "calendar" ? dayLabel(day) : props.title;

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col px-4 pb-20 md:h-dvh md:pb-3">
      <header className="flex flex-col gap-3 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Brand />
          <AppNav />
          <div className="flex flex-wrap gap-1.5">
            {home && (
              <button type="button" aria-pressed={localOnly} onClick={toggleLocalOnly}
                      title={`Només el que passa a menys de ${LOCAL_RADIUS_KM} km del centre de ${home.name}`}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[13px] font-semibold ${localOnly ? "border-transparent bg-accent text-surface" : "border-line bg-surface text-fg-2"}`}>
                <House size={14} /> Sense sortir {ofPlace(home.name)}
              </button>
            )}
            {!localOnly && zones.filter((z) => z.active).map((z) => {
              const on = !zoneOff.has(z.name);
              return (
                <button key={z.id} type="button" aria-pressed={on}
                        onClick={() => setZoneOff((s) => { const n = new Set(s); if (on) n.add(z.name); else n.delete(z.name); return n; })}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[13px] font-medium ${on ? "border-transparent bg-accent-soft text-accent" : "border-line bg-surface text-fg-2"}`}>
                  <MapPin size={14} /> {z.name} · {z.radius_km} km
                </button>
              );
            })}
          </div>
          <label className="flex min-w-0 flex-1 basis-full items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 md:ml-auto md:max-w-72 md:basis-auto">
            <Search size={17} className="text-fg-3" />
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
                   placeholder="Cerca: jazz, excursió, taller…" aria-label="Cerca"
                   className="w-full min-w-0 bg-transparent text-sm outline-none" />
            <kbd className="hidden rounded border border-b-2 border-line px-1 text-[11px] text-fg-2 md:inline">/</kbd>
          </label>
        </div>

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
            <h1 className="font-display text-xl font-medium">{listTitle}</h1>
            <span className="text-[13px] text-fg-3 tabular-nums">
              {ordered.all.length} esdeveniments · {props.mode === "list" && props.sort === "date" ? "per data" : "per puntuació"}
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
            {props.mode === "calendar" && ordered.all.length > 0 && (
              <p className="p-4 text-center text-[13px] text-fg-3">Final del dia · llisca o prem → per anar al dia següent</p>
            )}
          </div>
        </section>

        <aside aria-label="Fitxa de l'esdeveniment"
               className={`min-h-0 overflow-y-auto rounded-2xl border border-line bg-surface ${showDetail ? "block" : "hidden md:block"}`}>
          <EventDetail event={selected} score={selected ? scores.get(selected.id)! : null} nearby={nearby}
                       onToggle={toggle} onDismiss={(e, r) => { dismiss(e, r); setReasonsOpen(false); }} onNote={setNote}
                       onSelect={(id) => select(id)} onBack={() => setShowDetail(false)}
                       reasonsOpen={reasonsOpen} setReasonsOpen={setReasonsOpen} demo={demo} />
        </aside>
      </main>

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
