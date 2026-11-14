"use client";

import { ExternalLink, Plus, Search, Trash2, X } from "lucide-react";
import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { CATEGORIES } from "@/lib/categories";
import type { Category } from "@/lib/types";
import { PipelineButton } from "./pipeline-button";
import { addSource, deleteSource, setSourceActive } from "./sources-actions";
import {
  addableFromQuery, filterSources, KIND_LABELS, type SourceKind, sourceKind, STATUS_LABELS, type StatusFilter,
} from "./sources-filter";
import type { FormState } from "@/lib/geo-actions";

export type EditableSource = {
  id: string;
  name: string;
  url: string | null;
  status: "active" | "paused" | "proposed" | "rejected";
  discovered_via: string | null;
  last_success_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  adapter: string | null;
  /** El pipeline l'ha pausada perquè no donava plans nous (data ISO); null si no. */
  auto_paused_at?: string | null;
  auto_paused_reason?: string | null;
};

const input = "h-10 rounded-lg border border-line bg-bg px-3 outline-none focus:border-accent";
const iconBtn = "grid size-9 place-items-center rounded-lg border border-line bg-surface text-fg-2 hover:bg-surface-2 disabled:opacity-40";

const when = (iso: string) =>
  new Date(iso).toLocaleString("ca", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" });

function SourceRow({ source, onError }: { source: EditableSource; onError: (m: string | null) => void }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<string | null>) => start(async () => onError(await fn()));
  const active = source.status === "active";
  const dot = !active ? "bg-line" : source.consecutive_failures >= 3 ? "bg-gastro" : source.consecutive_failures > 0 ? "bg-star" : "bg-going";

  return (
    <li className={`flex items-start gap-2.5 py-2.5 ${pending ? "opacity-60" : ""}`}>
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${active ? "" : "text-fg-3"}`}>
          {source.name}
          {source.url && (
            <a href={source.url} target="_blank" rel="noopener noreferrer" aria-label="Obrir la font"
               className="ml-1.5 inline-block align-middle text-fg-3 hover:text-accent">
              <ExternalLink size={13} />
            </a>
          )}
        </p>
        <p className="text-xs text-fg-3">
          {!active ? (source.auto_paused_at
            ? `Pausada automàticament el ${when(source.auto_paused_at)}: ${(source.auto_paused_reason ?? "sense plans nous").toLowerCase()}. Activa-la si la vols tornar a llegir.`
            : "Pausada") : source.last_success_at ? `Actualitzada ${when(source.last_success_at)}` : "Pendent de la primera lectura"}
          {(source.adapter === "llm" || source.adapter === "instagram") && " · llegida amb Gemini"}
        </p>
        {active && source.consecutive_failures > 0 && source.last_error && (
          <p className="mt-0.5 line-clamp-2 text-xs text-gastro" title={source.last_error}>
            {source.consecutive_failures} errors seguits: {source.last_error}
          </p>
        )}
      </div>
      <label className="flex shrink-0 items-center gap-1.5 pt-1 text-sm text-fg-2">
        <input type="checkbox" checked={active} disabled={pending} className="size-4 accent-accent"
               onChange={(e) => run(() => setSourceActive(source.id, e.target.checked))} />
        <span className="hidden sm:inline">activa</span>
      </label>
      {source.discovered_via !== "seed" && (
        <button type="button" className={iconBtn} disabled={pending} title="Esborrar la font" aria-label={`Esborrar ${source.name}`}
                onClick={() => confirm(`Esborrar «${source.name}»? Els esdeveniments que ja n'han arribat es queden.`) && run(() => deleteSource(source.id))}>
          <Trash2 size={16} />
        </button>
      )}
    </li>
  );
}

interface ChipProps {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}

function Chip({ label, count, selected, onClick }: ChipProps) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick}
            className={`h-8 rounded-full border px-3 text-sm ${selected
              ? "border-accent bg-accent text-surface"
              : "border-line bg-surface text-fg-2 hover:bg-surface-2"}`}>
      {label} <span className={selected ? "opacity-80" : "text-fg-3"}>{count}</span>
    </button>
  );
}

const KINDS = Object.keys(KIND_LABELS) as SourceKind[];
const STATUSES = Object.keys(STATUS_LABELS) as StatusFilter[];

export function SourcesEditor({ sources }: { sources: EditableSource[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addSource, { status: "idle" });
  const [rowError, setRowError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<SourceKind | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const urlInput = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => filterSources(sources, { query, kind, status }), [sources, query, kind, status]);
  // Els recomptes de cada xip tenen en compte la cerca i l'altre filtre, no el seu propi.
  const kindCount = (k: SourceKind | "all") => filterSources(sources, { query, kind: k, status }).length;
  const statusCount = (s: StatusFilter) => filterSources(sources, { query, kind, status: s }).length;
  const kindsPresent = KINDS.filter((k) => sources.some((s) => sourceKind(s) === k));
  const filtering = query.trim() !== "" || kind !== "all" || status !== "all";
  const addable = visible.length === 0 ? addableFromQuery(query) : null;

  const prefillAdd = (text: string) => {
    if (!urlInput.current) return;
    urlInput.current.value = text;
    urlInput.current.scrollIntoView({ behavior: "smooth", block: "center" });
    urlInput.current.focus();
  };

  return (
    <div className="flex flex-col gap-3">
      <PipelineButton />
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                 autoCapitalize="none" autoComplete="off" placeholder="Cerca per nom, web o @compte"
                 aria-label="Cercar fonts" className={`${input} w-full pr-9 pl-9`} />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Esborrar la cerca"
                    className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-fg-3 hover:text-fg">
              <X size={16} />
            </button>
          )}
        </div>
        {kindsPresent.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipus de font">
            <Chip label="Totes" count={kindCount("all")} selected={kind === "all"} onClick={() => setKind("all")} />
            {kindsPresent.map((k) => (
              <Chip key={k} label={KIND_LABELS[k]} count={kindCount(k)} selected={kind === k} onClick={() => setKind(k)} />
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estat de la font">
          {STATUSES.filter((s) => s !== "errors" || statusCount("errors") > 0 || status === "errors").map((s) => (
            <Chip key={s} label={STATUS_LABELS[s]} count={statusCount(s)} selected={status === s} onClick={() => setStatus(s)} />
          ))}
        </div>
        {filtering && (
          <p className="text-xs text-fg-3">
            {visible.length} de {sources.length} fonts ·{" "}
            <button type="button" className="underline hover:text-accent"
                    onClick={() => { setQuery(""); setKind("all"); setStatus("all"); }}>
              treure els filtres
            </button>
          </p>
        )}
      </div>

      {visible.length > 0 ? (
        <ul className="divide-y divide-line">
          {visible.map((s) => <SourceRow key={s.id} source={s} onError={setRowError} />)}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-line p-3 text-sm text-fg-2">
          <p>{query.trim() ? <>No tens cap font que coincideixi amb «{query.trim()}».</> : "Cap font amb aquests filtres."}</p>
          {addable && (
            <button type="button" onClick={() => prefillAdd(addable)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 font-semibold text-surface">
              <Plus size={16} /> Afegir {addable}
            </button>
          )}
        </div>
      )}
      {rowError && <p className="text-sm text-gastro">{rowError}</p>}

      <form action={action} className="flex flex-col gap-2 border-t border-line pt-3">
        <p className="text-sm font-medium">Afegir una font</p>
        <input ref={urlInput} name="url" type="text" inputMode="url" autoCapitalize="none" required placeholder="https://… (web, Eventbrite, Meetup, Luma, calendari .ics) o @compte d'Instagram"
               aria-label="Enllaç de la font" className={input} />
        <div className="flex flex-wrap gap-2">
          <input name="name" placeholder="Nom (opcional)" aria-label="Nom de la font" className={`${input} min-w-40 flex-1`} />
          <input name="city" list="municipis" autoComplete="off" placeholder="Municipi (opcional)"
                 aria-label="Municipi on són els esdeveniments" className={`${input} min-w-40 flex-1`} />
          <select name="category" defaultValue="" aria-label="Categoria per defecte" className={`${input} min-w-40 flex-1`}>
            <option value="">Categoria: automàtica</option>
            {(Object.keys(CATEGORIES) as Category[]).map((c) => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}
          </select>
        </div>
        <button type="submit" disabled={pending}
                className="h-10 self-start rounded-lg bg-accent px-4 text-sm font-semibold text-surface disabled:opacity-60">
          {pending ? "Comprovant el web…" : "Afegir la font"}
        </button>
        <p className="text-xs text-fg-3">
          Es comprova que el web permeti la lectura automàtica (robots.txt). El municipi serveix per situar els esdeveniments
          que no diuen on són; la categoria s&apos;aplica quan el títol no la deixa clara (p. ex. un grup de jocs → Gastronomia/social). Les fonts noves es llegeixen a la propera actualització (cada 6 hores).
        </p>
      </form>
      {state.message && <p className={`text-sm ${state.status === "error" ? "text-gastro" : "text-going"}`}>{state.message}</p>}
    </div>
  );
}
