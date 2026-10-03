"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { addSource, deleteSource, setSourceActive } from "./sources-actions";
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
          {!active ? "Pausada" : source.last_success_at ? `Actualitzada ${when(source.last_success_at)}` : "Pendent de la primera lectura"}
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

export function SourcesEditor({ sources }: { sources: EditableSource[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addSource, { status: "idle" });
  const [rowError, setRowError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line">
        {sources.map((s) => <SourceRow key={s.id} source={s} onError={setRowError} />)}
      </ul>
      {rowError && <p className="text-sm text-gastro">{rowError}</p>}

      <form action={action} className="flex flex-col gap-2 border-t border-line pt-3">
        <p className="text-sm font-medium">Afegir una font</p>
        <input name="url" type="text" inputMode="url" autoCapitalize="none" required placeholder="https://… (web, Eventbrite, grup de Meetup, calendari .ics) o @compte d'Instagram"
               aria-label="Enllaç de la font" className={input} />
        <div className="flex flex-wrap gap-2">
          <input name="name" placeholder="Nom (opcional)" aria-label="Nom de la font" className={`${input} min-w-40 flex-1`} />
          <input name="city" list="municipis" autoComplete="off" placeholder="Municipi (opcional)"
                 aria-label="Municipi on són els esdeveniments" className={`${input} min-w-40 flex-1`} />
        </div>
        <button type="submit" disabled={pending}
                className="h-10 self-start rounded-lg bg-accent px-4 text-sm font-semibold text-surface disabled:opacity-60">
          {pending ? "Comprovant el web…" : "Afegir la font"}
        </button>
        <p className="text-xs text-fg-3">
          Es comprova que el web permeti la lectura automàtica (robots.txt). El municipi serveix per situar els esdeveniments
          que no diuen on són. Les fonts noves es llegeixen a la propera actualització (cada 6 hores).
        </p>
      </form>
      {state.message && <p className={`text-sm ${state.status === "error" ? "text-gastro" : "text-going"}`}>{state.message}</p>}
    </div>
  );
}
