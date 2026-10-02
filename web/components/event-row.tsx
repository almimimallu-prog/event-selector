"use client";

import { CheckCircle2, Star, TriangleAlert } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import { local, shortDate } from "@/lib/dates";
import { nearestZoneLabel } from "@/lib/ranking";
import type { AppEvent } from "@/lib/types";

export function Thumb({ event, size = 56 }: { event: AppEvent; size?: number }) {
  const cat = CATEGORIES[event.category];
  const Icon = cat.icon;
  return (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-lg ${cat.soft} ${cat.text}`}
      style={{ width: size, height: size }}
    >
      <Icon size={size * 0.45} strokeWidth={1.75} aria-hidden />
      {event.image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- imatges de qualsevol domini de les fonts
        <img src={event.image_url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover"
             onError={(e) => e.currentTarget.remove()} />
      )}
    </div>
  );
}

export function CategoryChip({ event }: { event: AppEvent }) {
  const cat = CATEGORIES[event.category];
  const Icon = cat.icon;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full py-0.5 pr-2 pl-1.5 text-[11px] font-semibold ${cat.soft} ${cat.text}`}>
      <Icon size={13} aria-hidden />
      {cat.label}
    </span>
  );
}

export function whenLabel(event: AppEvent, withDate = false): string {
  if (event.kind === "long_running") {
    return event.end_at ? `Fins al ${shortDate(event.end_at)}` : "Permanent";
  }
  if (event.kind === "course") {
    return `Propera sessió ${shortDate(event.start_at)}${event.all_day ? "" : ` · ${local(event.start_at).hhmm}`}`;
  }
  const time = event.all_day ? "Tot el dia" : local(event.start_at).hhmm;
  return withDate ? `${shortDate(event.start_at)} · ${time}` : time;
}

/** "Què és?": l'explicació curta o, si no n'hi ha, la primera frase de la descripció. */
export function explanation(event: AppEvent): string | null {
  if (event.summary_ca?.trim()) return event.summary_ca.trim();
  const first = event.description?.trim().split(/(?<=[.!?])\s/)[0];
  if (!first) return null;
  return first.length > 140 ? `${first.slice(0, 137).trimEnd()}…` : first;
}

export function priceLabel(event: AppEvent): string | null {
  if (event.is_free) return "Gratuït";
  if (event.price_min != null) return `${Number(event.price_min).toLocaleString("ca")} €`;
  return event.price_text;
}

type Props = {
  event: AppEvent;
  score: number;
  selected: boolean;
  onSelect: () => void;
  withDate?: boolean;
};

export function EventRow({ event, score, selected, onSelect, withDate }: Props) {
  const mine = event.user_state === "going" || event.user_state === "interested";
  const where = [event.venue_name, event.city].filter(Boolean).join(", ");
  const km = nearestZoneLabel(event);
  const price = priceLabel(event);
  const explain = explanation(event);
  return (
    <button
      type="button"
      onClick={onSelect}
      data-selected={selected || undefined}
      className={`grid w-full grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3.5 border-l-[3px] px-4 py-2 text-left transition-colors hover:bg-surface-2 ${
        selected ? "border-l-accent bg-accent-soft" : mine ? "border-l-transparent bg-surface-2/60" : "border-l-transparent"
      }`}
    >
      <Thumb event={event} />
      <div className="min-w-0">
        <div className="text-[13px] text-fg-2 tabular-nums">
          {whenLabel(event, withDate)}
          {price && ` · ${price}`}
        </div>
        <div className="truncate text-[15px] font-semibold">
          {event.status === "maybe_cancelled" && <span className="text-gastro">[Cancel·lat?] </span>}
          {event.title}
        </div>
        {explain && <p className="line-clamp-1 text-[13px] text-fg-2">{explain}</p>}
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-fg-3">
          <CategoryChip event={event} />
          <span className="truncate">{[where, km].filter(Boolean).join(" · ")}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {event.has_unseen_changes && mine && <TriangleAlert size={18} className="text-star" aria-label="Ha canviat" />}
        {event.user_state === "going" ? (
          <CheckCircle2 size={20} className="text-going" aria-label="Hi vaig" />
        ) : event.user_state === "interested" ? (
          <Star size={20} className="fill-star text-star" aria-label="M'interessa" />
        ) : (
          <span className="min-w-8 text-right font-display text-lg font-medium text-fg-2 tabular-nums">{score}</span>
        )}
      </div>
    </button>
  );
}
