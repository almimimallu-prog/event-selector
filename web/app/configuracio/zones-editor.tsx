"use client";

import { House, MapPin, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { MAX_KM, MAX_ZONES, MIN_KM } from "@/lib/zones";
import {
  addZone, deleteZone, makeMainZone, setZoneActive, setZoneMunicipality, setZoneRadius, type FormState,
} from "./zones-actions";

export type EditableZone = { id: string; name: string; radius_km: number; active: boolean };

const input = "h-10 rounded-lg border border-line bg-bg px-3 outline-none focus:border-accent";
const iconBtn = "grid size-9 place-items-center rounded-lg border border-line bg-surface text-fg-2 hover:bg-surface-2 disabled:opacity-40";

function ZoneRow({ zone, main, onError }: { zone: EditableZone; main: boolean; onError: (m: string | null) => void }) {
  const [pending, start] = useTransition();
  const [radius, setRadius] = useState(zone.radius_km);
  const run = (fn: () => Promise<string | null>) => start(async () => onError(await fn()));
  const saveRadius = () => radius !== zone.radius_km && run(() => setZoneRadius(zone.id, radius));

  return (
    <li className={`flex flex-col gap-2.5 py-3 ${pending ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2">
        <MapPin size={16} className={`shrink-0 ${zone.active ? "text-accent" : "text-fg-3"}`} />
        <input defaultValue={zone.name} list="municipis" autoComplete="off" aria-label="Municipi"
               className={`h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 font-medium hover:border-line focus:border-accent focus:bg-bg ${zone.active ? "" : "text-fg-3 line-through"}`}
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
        {main && <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">principal</span>}
        <label className="flex shrink-0 items-center gap-1.5 text-sm text-fg-2" title="Si la desactives, els seus esdeveniments no surten">
          <input type="checkbox" checked={zone.active} disabled={pending} className="size-4 accent-accent"
                 onChange={(e) => run(() => setZoneActive(zone.id, e.target.checked))} />
          <span className="hidden sm:inline">activa</span>
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
      <label className="flex items-center gap-3 pl-6 text-sm text-fg-2">
        <span className="shrink-0">Radi</span>
        <input type="range" min={MIN_KM} max={MAX_KM} step={1} value={radius} aria-label={`Radi de ${zone.name} en km`}
               className="min-w-0 flex-1 accent-accent"
               onChange={(e) => setRadius(Number(e.target.value))}
               onPointerUp={saveRadius} onKeyUp={saveRadius} onBlur={saveRadius} />
        <span className="w-14 shrink-0 text-right font-medium text-fg tabular-nums">{radius} km</span>
      </label>
    </li>
  );
}

export function ZonesEditor({ zones }: { zones: EditableZone[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addZone, { status: "idle" });
  const [rowError, setRowError] = useState<string | null>(null);
  const [newRadius, setNewRadius] = useState(15);
  const mainId = zones.find((z) => z.active)?.id;

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line">
        {zones.map((z) => (
          <ZoneRow key={`${z.id}-${z.name}-${z.radius_km}`} zone={z} main={z.id === mainId} onError={setRowError} />
        ))}
      </ul>
      {rowError && <p className="text-sm text-gastro">{rowError}</p>}
      <p className="text-xs text-fg-3">
        Fins a {MAX_ZONES} municipis, cadascun amb el seu radi (de {MIN_KM} a {MAX_KM} km). Només surten els esdeveniments
        dins d&apos;alguna zona activa. Per canviar de municipi, escriu-ne un altre al nom. La principal és la del botó
        «Sense sortir de…».
      </p>

      {zones.length < MAX_ZONES && (
        <form action={action} className="flex flex-col gap-2.5 border-t border-line pt-3">
          <label className="flex flex-col gap-1 text-sm text-fg-2">
            Afegir un municipi
            <input name="name" list="municipis" required autoComplete="off" placeholder="Manresa" className={input} />
          </label>
          <label className="flex items-center gap-3 text-sm text-fg-2">
            <span className="shrink-0">Radi</span>
            <input name="radius" type="range" min={MIN_KM} max={MAX_KM} step={1} value={newRadius}
                   onChange={(e) => setNewRadius(Number(e.target.value))} className="min-w-0 flex-1 accent-accent" />
            <span className="w-14 shrink-0 text-right font-medium text-fg tabular-nums">{newRadius} km</span>
          </label>
          <button type="submit" disabled={pending}
                  className="h-10 self-start rounded-lg bg-accent px-4 text-sm font-semibold text-surface disabled:opacity-60">
            {pending ? "Afegint…" : "Afegir"}
          </button>
        </form>
      )}
      {state.message && <p className={`text-sm ${state.status === "error" ? "text-gastro" : "text-going"}`}>{state.message}</p>}
    </div>
  );
}
