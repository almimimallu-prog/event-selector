"use client";

import { House, MapPin, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { addZone, deleteZone, makeMainZone, setZoneActive, setZoneRadius, type FormState } from "./zones-actions";

export type EditableZone = { id: string; name: string; radius_km: number; active: boolean };

const input = "h-10 rounded-lg border border-line bg-bg px-3 outline-none focus:border-accent";
const iconBtn = "grid size-9 place-items-center rounded-lg border border-line bg-surface text-fg-2 hover:bg-surface-2 disabled:opacity-40";

function ZoneRow({ zone, main, onError }: { zone: EditableZone; main: boolean; onError: (m: string | null) => void }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<string | null>) => start(async () => onError(await fn()));

  return (
    <li className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 py-2 ${pending ? "opacity-60" : ""}`}>
      <span className={`flex min-w-0 basis-full items-center gap-2 font-medium sm:flex-1 sm:basis-0 ${zone.active ? "" : "text-fg-3"}`}>
        <MapPin size={16} className={zone.active ? "text-accent" : "text-fg-3"} />
        <span className={zone.active ? "" : "line-through"}>{zone.name}</span>
        {main && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">principal</span>}
      </span>
      <div className="flex items-center gap-2 pl-6 sm:pl-0">
        <label className="flex items-center gap-1.5 text-sm text-fg-2">
          radi
          <input type="number" min={1} max={100} step={1} defaultValue={zone.radius_km} aria-label={`Radi de ${zone.name} en km`}
                 className="h-9 w-16 rounded-lg border border-line bg-bg px-2 text-right tabular-nums"
                 onBlur={(e) => {
                   const v = Number(e.target.value);
                   if (v !== zone.radius_km) run(() => setZoneRadius(zone.id, v));
                 }}
                 onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
          km
        </label>
        <label className="flex items-center gap-1.5 text-sm text-fg-2" title="Si la desactives, els seus esdeveniments no surten">
          <input type="checkbox" checked={zone.active} disabled={pending} className="size-4 accent-accent"
                 onChange={(e) => run(() => setZoneActive(zone.id, e.target.checked))} />
          activa
        </label>
        <button type="button" className={iconBtn} disabled={pending || main} title="Fer-la principal (mode «Sense sortir de…»)"
                aria-label={`Fer principal ${zone.name}`} onClick={() => run(() => makeMainZone(zone.id))}>
          <House size={16} />
        </button>
        <button type="button" className={iconBtn} disabled={pending} title="Esborrar la zona" aria-label={`Esborrar ${zone.name}`}
                onClick={() => confirm(`Esborrar la zona ${zone.name}?`) && run(() => deleteZone(zone.id))}>
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  );
}

export function ZonesEditor({ zones }: { zones: EditableZone[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addZone, { status: "idle" });
  const [rowError, setRowError] = useState<string | null>(null);
  const mainId = zones.find((z) => z.active)?.id;

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line">
        {zones.map((z) => (
          <ZoneRow key={`${z.id}-${z.radius_km}`} zone={z} main={z.id === mainId} onError={setRowError} />
        ))}
      </ul>
      {rowError && <p className="text-sm text-gastro">{rowError}</p>}
      <p className="text-xs text-fg-3">
        Només surten els esdeveniments dins d&apos;alguna zona activa. La principal és la del botó «Sense sortir de…» (5 km).
      </p>

      <form action={action} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <label className="flex min-w-44 flex-1 flex-col gap-1 text-sm text-fg-2">
          Afegir una zona (municipi)
          <input name="name" list="municipis" required autoComplete="off" placeholder="Manresa" className={input} />
        </label>
        <label className="flex w-24 flex-col gap-1 text-sm text-fg-2">
          Radi (km)
          <input name="radius" type="number" min={1} max={100} defaultValue={15} required className={input} />
        </label>
        <button type="submit" disabled={pending}
                className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-surface disabled:opacity-60">
          {pending ? "Afegint…" : "Afegir"}
        </button>
      </form>
      {state.message && <p className={`text-sm ${state.status === "error" ? "text-gastro" : "text-going"}`}>{state.message}</p>}
    </div>
  );
}
