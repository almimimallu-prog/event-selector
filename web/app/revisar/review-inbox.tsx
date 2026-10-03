"use client";

import { Check, ExternalLink, GitMerge, Star, X } from "lucide-react";
import { useState, useTransition } from "react";
import { WEEKDAYS, local, shortDate } from "@/lib/dates";
import { type DupSide, type DuplicatePair, type HeldEvent, reasonText } from "@/lib/review";
import { approveEvent, markDistinct, mergeEvents, rejectEvent } from "./actions";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50";
const primary = "inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-surface disabled:opacity-50";

function when(start: string, allDay: boolean): string {
  const l = local(start);
  return `${WEEKDAYS[l.weekday]} ${shortDate(start)}${allDay ? "" : ` · ${l.hhmm}`}`;
}

function Side({ side, label }: { side: DupSide; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-bg p-3">
      <span className="text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase">{label}</span>
      <p className="font-medium">
        {side.marked && <Star size={14} className="mr-1 inline fill-star text-star" aria-label="Marcat" />}
        {side.title}
      </p>
      <p className="text-sm text-fg-2">{when(side.start_at, side.all_day)}</p>
      <p className="text-sm text-fg-2">{[side.venue, side.city].filter(Boolean).join(", ") || "Sense lloc"}</p>
      {side.summary && <p className="text-sm text-fg-3">{side.summary}</p>}
      <p className="text-xs text-fg-3">
        {side.sources.join(" · ")}
        {side.url && (
          <a href={side.url} target="_blank" rel="noopener noreferrer" className="ml-1.5 inline-block align-middle text-accent">
            <ExternalLink size={12} aria-label="Obrir" />
          </a>
        )}
      </p>
    </div>
  );
}

function DuplicateCard({ pair, onDone }: { pair: DuplicatePair; onDone: (id: string) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<string | null>) =>
    start(async () => {
      const e = await fn();
      setError(e);
      if (!e) onDone(`d${pair.id}`);
    });

  return (
    <li className={`flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 ${pending ? "opacity-60" : ""}`}>
      <p className="text-sm text-fg-2">Són el mateix pla? <span className="text-fg-3">(semblança {Math.round(pair.score * 100)} %)</span></p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Side side={pair.a} label="A" />
        <Side side={pair.b} label="B" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} className={primary} onClick={() => run(() => mergeEvents(pair.a.id, pair.b.id))}>
          <GitMerge size={16} /> El mateix, quedar-me A
        </button>
        <button type="button" disabled={pending} className={primary} onClick={() => run(() => mergeEvents(pair.b.id, pair.a.id))}>
          <GitMerge size={16} /> El mateix, quedar-me B
        </button>
        <button type="button" disabled={pending} className={btn} onClick={() => run(() => markDistinct(pair.id))}>
          <X size={16} /> Són diferents
        </button>
      </div>
      {error && <p className="text-sm text-gastro">{error}</p>}
    </li>
  );
}

function HeldCard({ event, onDone }: { event: HeldEvent; onDone: (id: string) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const noPlace = event.review_reasons.includes("sense lloc") && !event.city;
  const run = (fn: () => Promise<string | null>) =>
    start(async () => {
      const e = await fn();
      setError(e);
      if (!e) onDone(`h${event.id}`);
    });

  return (
    <li className={`flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4 ${pending ? "opacity-60" : ""}`}>
      <div>
        <p className="font-medium">{event.title}</p>
        <p className="text-sm text-fg-2">{when(event.start_at, event.all_day)}{event.city && ` · ${event.city}`}</p>
        {event.summary_ca && <p className="text-sm text-fg-3">{event.summary_ca}</p>}
        <p className="mt-1 text-xs text-fg-3">
          Retingut perquè {event.review_reasons.map(reasonText).join(" i ")} · {event.sources.join(" · ")}
          {event.url && (
            <a href={event.url} target="_blank" rel="noopener noreferrer" className="ml-1.5 inline-block align-middle text-accent">
              <ExternalLink size={12} aria-label="Obrir la font" />
            </a>
          )}
        </p>
      </div>
      {noPlace && (
        <input value={city} onChange={(e) => setCity(e.target.value)} list="municipis" autoComplete="off"
               placeholder="On és? (municipi, opcional)" aria-label="Municipi"
               className="h-10 rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent" />
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} className={primary} onClick={() => run(() => approveEvent(event.id, city))}>
          <Check size={16} /> Publicar
        </button>
        <button type="button" disabled={pending} className={btn} onClick={() => run(() => rejectEvent(event.id))}>
          <X size={16} /> Descartar
        </button>
      </div>
      {error && <p className="text-sm text-gastro">{error}</p>}
    </li>
  );
}

export function ReviewInbox({ duplicates, held }: { duplicates: DuplicatePair[]; held: HeldEvent[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const markDone = (id: string) => setDone((s) => new Set(s).add(id));
  const dups = duplicates.filter((d) => !done.has(`d${d.id}`));
  const pending = held.filter((e) => !done.has(`h${e.id}`));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Possibles duplicats <span className="text-fg-3">({dups.length})</span></h2>
        {dups.length === 0
          ? <p className="text-sm text-fg-3">Cap duplicat pendent.</p>
          : <ul className="flex flex-col gap-3">{dups.map((d) => <DuplicateCard key={d.id} pair={d} onDone={markDone} />)}</ul>}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Per publicar <span className="text-fg-3">({pending.length})</span></h2>
        <p className="text-sm text-fg-2">Plans que el pipeline no ha publicat sols. No surten a l&apos;agenda fins que els publiquis.</p>
        {pending.length === 0
          ? <p className="text-sm text-fg-3">Res pendent.</p>
          : <ul className="flex flex-col gap-3">{pending.map((e) => <HeldCard key={e.id} event={e} onDone={markDone} />)}</ul>}
      </section>
    </div>
  );
}
