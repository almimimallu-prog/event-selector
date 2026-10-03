"use client";

import { MapPin, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import {
  addZone, deleteZone, getMunicipalityNames, setZoneMunicipality, setZoneRadius, type FormState,
} from "@/lib/geo-actions";
import type { Zone } from "@/lib/types";
import { MAX_KM, MAX_ZONES, MIN_KM } from "@/lib/zones";

const LIST_ID = "geo-municipis";
const radiusText = (km: number) => (km > 0 ? `${km} km` : "Només el municipi");

function RadiusBar({ value, onChange, onCommit, label }: {
  value: number; onChange: (v: number) => void; onCommit?: () => void; label: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-fg-2">
      <span className="flex items-baseline justify-between">
        <span>Radi</span>
        <span className="font-medium text-fg tabular-nums">{radiusText(value)}</span>
      </span>
      <input type="range" min={MIN_KM} max={MAX_KM} step={1} value={value} aria-label={label}
             className="w-full accent-accent" onChange={(e) => onChange(Number(e.target.value))}
             onPointerUp={onCommit} onKeyUp={onCommit} onBlur={onCommit} />
      <span className="flex justify-between text-[11px] text-fg-3 tabular-nums">
        <span>{MIN_KM} km</span><span>{MAX_KM / 2} km</span><span>{MAX_KM} km</span>
      </span>
    </label>
  );
}

function ZoneRow({ zone, canDelete, onError }: { zone: Zone; canDelete: boolean; onError: (m: string | null) => void }) {
  const [pending, start] = useTransition();
  const [radius, setRadius] = useState(zone.radius_km);
  const run = (fn: () => Promise<string | null>) => start(async () => onError(await fn()));

  return (
    <li className={`flex flex-col gap-2 py-3 ${pending ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2">
        <MapPin size={18} className="shrink-0 text-accent" aria-hidden />
        <input defaultValue={zone.name} list={LIST_ID} autoComplete="off" aria-label="Municipi"
               className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 font-medium outline-none focus:border-accent"
               onBlur={(e) => {
                 const el = e.target;
                 const v = el.value.trim();
                 if (!v || v === zone.name) {
                   el.value = zone.name;
                   return;
                 }
                 run(async () => {
                   const error = await setZoneMunicipality(zone.id, v);
                   if (error) el.value = zone.name; // municipi no vàlid: es torna a l'anterior
                   return error;
                 });
               }}
               onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        {canDelete && (
          <button type="button" disabled={pending} title="Treure aquest municipi" aria-label={`Treure ${zone.name}`}
                  onClick={() => confirm(`Treure ${zone.name}?`) && run(() => deleteZone(zone.id))}
                  className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-surface text-fg-2 hover:bg-surface-2 disabled:opacity-40">
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <div className="pl-7">
        <RadiusBar value={radius} onChange={setRadius} label={`Radi al voltant de ${zone.name}`}
                   onCommit={() => radius !== zone.radius_km && run(() => setZoneRadius(zone.id, radius))} />
      </div>
    </li>
  );
}

/** Municipis (fins a MAX_ZONES) i el radi al voltant de cadascun. */
export function GeoEditor({ zones }: { zones: Zone[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addZone, { status: "idle" });
  const [rowError, setRowError] = useState<string | null>(null);
  const [newRadius, setNewRadius] = useState(15);
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    getMunicipalityNames().then((n) => alive && setNames(n));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-line">
        {zones.map((z) => (
          <ZoneRow key={`${z.id}-${z.name}-${z.radius_km}`} zone={z} canDelete={zones.length > 1} onError={setRowError} />
        ))}
      </ul>
      {rowError && <p className="text-sm text-gastro">{rowError}</p>}

      {zones.length < MAX_ZONES && (
        <form action={action} className="flex flex-col gap-2 border-t border-line pt-3">
          <label className="flex flex-col gap-1 text-sm text-fg-2">
            Afegir un altre municipi
            <input name="name" list={LIST_ID} required autoComplete="off" placeholder="p. ex. Manresa"
                   className="h-10 rounded-lg border border-line bg-bg px-3 outline-none focus:border-accent" />
          </label>
          <input type="hidden" name="radius" value={newRadius} />
          <RadiusBar value={newRadius} onChange={setNewRadius} label="Radi del municipi nou" />
          <button type="submit" disabled={pending}
                  className="h-10 self-start rounded-lg bg-accent px-4 text-sm font-semibold text-surface disabled:opacity-60">
            {pending ? "Afegint…" : "Afegir"}
          </button>
        </form>
      )}
      {state.message && <p className={`text-sm ${state.status === "error" ? "text-gastro" : "text-going"}`}>{state.message}</p>}
      <p className="text-xs text-fg-3">
        Fins a {MAX_ZONES} municipis. Per canviar-ne un, escriu-ne el nom nou. Amb el radi a 0 només surt el que passa al
        mateix municipi.
      </p>
      <datalist id={LIST_ID}>
        {names.map((n) => <option key={n} value={n} />)}
      </datalist>
    </div>
  );
}
