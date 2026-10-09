"use client";

import {
  Accessibility, ArrowLeft, CalendarPlus, CheckCircle2, Clock, Hourglass, MapPin, Share2, Star, Ticket,
  TriangleAlert, X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { CATEGORIES, DISMISS_REASONS } from "@/lib/categories";
import { WEEKDAYS, local, shortDate } from "@/lib/dates";
import { googleCalendarUrl, mapsUrl } from "@/lib/links";
import { nearestZoneLabel, type Score } from "@/lib/ranking";
import { createClient } from "@/lib/supabase/client";
import type { AppEvent, DismissReason } from "@/lib/types";
import { CategoryChip, explanation, hideBroken, priceLabel } from "./event-row";

const btn = "inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2";
const Kbd = ({ k }: { k: string }) => (
  <kbd className="ml-0.5 hidden rounded border border-b-2 border-line px-1 text-[11px] text-fg-2 md:inline">{k}</kbd>
);

function whenText(event: AppEvent): string {
  const s = local(event.start_at);
  const day = `${WEEKDAYS[s.weekday]} ${s.day} ${shortDate(event.start_at).split(" ")[1]}`;
  if (event.kind === "long_running") {
    return event.end_at ? `Del ${shortDate(event.start_at)} al ${shortDate(event.end_at)}` : `Des del ${shortDate(event.start_at)}`;
  }
  if (event.all_day) return `${day} · hora per confirmar`;
  const end = event.end_at && event.kind === "session" ? `–${local(event.end_at).hhmm}` : "";
  return `${day} · ${s.hhmm}${end}`;
}

type Props = {
  event: AppEvent | null;
  score: Score | null;
  nearby: AppEvent[];
  onToggle: (e: AppEvent, s: "interested" | "going") => void;
  onDismiss: (e: AppEvent, r: DismissReason | null) => void;
  onNote: (e: AppEvent, note: string) => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  reasonsOpen: boolean;
  setReasonsOpen: (open: boolean) => void;
  demo?: boolean;
};

export function EventDetail(props: Props) {
  const { event, score, nearby, onToggle, onDismiss, onNote, onSelect, onBack, reasonsOpen, setReasonsOpen, demo } = props;
  const [series, setSeries] = useState<{ key: string; items: { id: string; start_at: string; all_day: boolean }[] }>();

  useEffect(() => {
    if (!event?.series_key || demo) return;
    let cancelled = false;
    createClient()
      .rpc("app_series", { p_series_key: event.series_key })
      .then(({ data }) => {
        if (!cancelled) setSeries({ key: event.series_key!, items: data ?? [] });
      });
    return () => {
      cancelled = true;
    };
  }, [event?.series_key, demo]);

  if (!event) {
    return <div className="p-10 text-center text-fg-3">Tria un esdeveniment de la llista.</div>;
  }
  const cat = CATEGORIES[event.category];
  const Icon = cat.icon;
  const maps = mapsUrl(event);
  const where = [event.venue_name, event.city].filter(Boolean).join(", ");
  const km = nearestZoneLabel(event);
  const price = priceLabel(event);
  const otherSessions = series?.key === event.series_key ? series.items.filter((s) => s.id !== event.id) : [];

  async function share() {
    const text = `${event!.title} — ${whenText(event!)}${where ? ` · ${where}` : ""}`;
    const url = event!.url ?? undefined;
    try {
      if (navigator.share) await navigator.share({ title: event!.title, text, url });
      else await navigator.clipboard.writeText([text, url].filter(Boolean).join("\n"));
    } catch {
      // L'usuari ha cancel·lat.
    }
  }

  return (
    <article className="pb-6">
      <button type="button" onClick={onBack} className={`${btn} m-3 md:hidden`}>
        <ArrowLeft size={16} /> Tornar a la llista
      </button>
      <div className={`relative flex aspect-[16/10] max-w-full items-end overflow-hidden p-5 ${cat.soft} ${cat.text}`}>
        <Icon size={64} strokeWidth={1.5} className="absolute top-5 left-5 opacity-80" aria-hidden />
        <p className="relative z-10 max-w-[85%] font-display text-2xl leading-tight font-bold text-balance">{event.title}</p>
        {event.image_url && (
          // eslint-disable-next-line @next/next/no-img-element -- imatges de qualsevol domini de les fonts
          <img key={event.image_url} src={event.image_url} alt="" className="absolute inset-0 z-20 size-full object-cover"
               onError={hideBroken} />
        )}
      </div>

      <div className="flex flex-col gap-4 px-5 pt-4">
        <div className="flex items-center justify-between gap-2">
          <CategoryChip event={event} />
          {score && <span className="font-display text-lg text-fg-2 tabular-nums" title="Puntuació">{score.total}</span>}
        </div>
        <h2 className="font-display text-2xl leading-tight font-medium text-balance">{event.title}</h2>

        {event.status === "maybe_cancelled" && (
          <p className="flex items-center gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">
            <TriangleAlert size={16} /> Ha desaparegut de la font: potser s&apos;ha cancel·lat.
          </p>
        )}
        {event.has_unseen_changes && (
          <p className="flex items-center gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">
            <TriangleAlert size={16} /> Les dades han canviat des que el vas marcar.
          </p>
        )}

        <div className="grid gap-2 text-sm text-fg-2">
          <p className="flex items-center gap-2.5"><Clock size={18} className="text-fg-3" />{whenText(event)}</p>
          {event.schedule_text && <p className="pl-7 text-fg-3">{event.schedule_text}</p>}
          {(where || km) && (
            <p className="flex items-center gap-2.5">
              <MapPin size={18} className="text-fg-3" />
              <span>
                {[where, km].filter(Boolean).join(" · ")}
                {maps && <> · <a href={maps} target="_blank" rel="noopener noreferrer" className="text-accent underline">Maps</a></>}
              </span>
            </p>
          )}
          {price && <p className="flex items-center gap-2.5"><Ticket size={18} className="text-fg-3" />{price}{event.price_text && price !== event.price_text && <span className="text-fg-3">({event.price_text})</span>}</p>}
          {event.venue_wheelchair && event.venue_wheelchair !== "unknown" && (
            <p className="flex items-center gap-2.5">
              <Accessibility size={18} className="text-fg-3" />
              {event.venue_wheelchair === "yes" ? "Accessible amb cadira de rodes" : event.venue_wheelchair === "limited" ? "Accessibilitat limitada" : "No accessible amb cadira de rodes"}
            </p>
          )}
        </div>

        {event.registration_deadline && (
          <p className="flex items-center gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">
            <Hourglass size={16} /> Inscripció fins al {shortDate(event.registration_deadline)}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onToggle(event, "interested")}
                  className={event.user_state === "interested" ? `${btn} border-transparent bg-warn-bg text-warn-fg` : btn}>
            <Star size={17} className={event.user_state === "interested" ? "fill-current" : ""} /> M&apos;interessa <Kbd k="S" />
          </button>
          <button type="button" onClick={() => onToggle(event, "going")}
                  className={event.user_state === "going" ? `${btn} border-transparent bg-accent text-surface` : btn}>
            <CheckCircle2 size={17} /> Hi vaig <Kbd k="A" />
          </button>
          <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className={btn} data-gcal>
            <CalendarPlus size={17} /> Google Calendar <Kbd k="G" />
          </a>
          {event.registration_url && (
            <a href={event.registration_url} target="_blank" rel="noopener noreferrer" className={btn}>
              <Ticket size={17} /> Entrades / inscripció
            </a>
          )}
          <button type="button" onClick={share} className={btn}><Share2 size={17} /> Compartir</button>
          <button type="button" onClick={() => setReasonsOpen(!reasonsOpen)} className={btn}>
            <X size={17} /> Descartar <Kbd k="X" />
          </button>
        </div>

        {reasonsOpen && (
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-dashed border-line p-2.5">
            <p className="w-full text-sm text-fg-2">Per què el descartes? (opcional, ajuda el rànquing)</p>
            {DISMISS_REASONS.map((r, i) => (
              <button key={r.key} type="button" onClick={() => onDismiss(event, r.key)}
                      className="rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-medium text-fg-2 hover:bg-surface-2">
                <span className="hidden md:inline">{i + 1} · </span>{r.label}
              </button>
            ))}
            <button type="button" onClick={() => onDismiss(event, null)}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-medium text-fg-2 hover:bg-surface-2">
              Només amagar
            </button>
          </div>
        )}

        {(explanation(event) || event.description) && (
          <section>
            <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase">Què és</h3>
            <p className="text-sm">{explanation(event) ?? event.description?.slice(0, 280)}</p>
            {event.description && (
              <details className="mt-2 text-sm text-fg-2">
                <summary className="cursor-pointer text-fg-3">Descripció original</summary>
                <p className="mt-1 whitespace-pre-line">{event.description}</p>
              </details>
            )}
          </section>
        )}

        {otherSessions.length > 0 && (
          <section>
            <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase">Altres sessions del cicle</h3>
            <p className="text-sm text-fg-2">
              {otherSessions.map((s) => `${shortDate(s.start_at)}${s.all_day ? "" : ` ${local(s.start_at).hhmm}`}`).join(" · ")}
            </p>
          </section>
        )}

        {nearby.length > 0 && (
          <section>
            <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase">A prop aquell dia</h3>
            <div className="grid gap-1 text-[13px]">
              {nearby.map((n) => {
                const NIcon = CATEGORIES[n.category].icon;
                return (
                  <button key={n.id} type="button" onClick={() => onSelect(n.id)}
                          className="flex items-center gap-2 text-left text-fg-2 hover:text-accent">
                    <NIcon size={15} className={CATEGORIES[n.category].text} />
                    {n.all_day ? "" : `${local(n.start_at).hhmm} · `}{n.title}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {event.sources.length > 0 && (
          <section>
            <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase">Fonts</h3>
            <div className="flex flex-wrap gap-1.5">
              {event.sources.map((s) =>
                s.url ? (
                  <a key={s.name + s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                     className="rounded-full border border-line px-3 py-1 text-[13px] text-fg-2 hover:text-accent">{s.name}</a>
                ) : (
                  <span key={s.name} className="rounded-full border border-line px-3 py-1 text-[13px] text-fg-2">{s.name}</span>
                ),
              )}
            </div>
          </section>
        )}

        {(event.user_state === "interested" || event.user_state === "going") && (
          <section>
            <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase">Nota personal</h3>
            <textarea
              key={event.id}
              defaultValue={event.note ?? ""}
              onBlur={(e) => e.target.value !== (event.note ?? "") && onNote(event, e.target.value)}
              placeholder="Amb qui hi vaig, què he de portar…"
              className="min-h-14 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
            />
          </section>
        )}
      </div>
    </article>
  );
}
