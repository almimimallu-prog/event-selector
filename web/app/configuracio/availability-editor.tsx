"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import type { AvailabilitySlot } from "@/lib/types";
import { setAvailability } from "./prefs-actions";

const DAYS = ["Dl", "Dm", "Dc", "Dj", "Dv", "Ds", "Dg"];
const OUTSIDE = ["Mai", "Gairebé mai", "A vegades", "Sovint", "Sempre"];
const time = "h-9 rounded-lg border border-line bg-bg px-2 tabular-nums outline-none focus:border-accent";

export function AvailabilityEditor({ slots, outside }: { slots: AvailabilitySlot[]; outside: number }) {
  const [list, setList] = useState(slots);
  const [outsideWeight, setOutsideWeight] = useState(outside);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function update(i: number, patch: Partial<AvailabilitySlot>) {
    setList((l) => l.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setDirty(true);
  }

  function save() {
    start(async () => {
      const error = await setAvailability(list, outsideWeight);
      setMessage(error ? { ok: false, text: error } : { ok: true, text: "Desat." });
      if (!error) setDirty(false);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-2">Franges en què normalment pots sortir: els plans que hi cauen puntuen més.</p>
      <ul className="flex flex-col gap-3">
        {list.map((s, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-xl border border-line p-3">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Dies">
              {DAYS.map((d, j) => {
                const iso = j + 1;
                const on = s.days.includes(iso);
                return (
                  <button key={d} type="button" aria-pressed={on}
                          onClick={() => update(i, { days: on ? s.days.filter((x) => x !== iso) : [...s.days, iso] })}
                          className={`h-8 w-9 rounded-lg border text-xs font-semibold ${on ? "border-transparent bg-accent text-surface" : "border-line bg-surface text-fg-2"}`}>
                    {d}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-sm text-fg-2">
              de <input type="time" value={s.from} onChange={(e) => update(i, { from: e.target.value })} aria-label="Des de" className={time} />
              a <input type="time" value={s.to} onChange={(e) => update(i, { to: e.target.value })} aria-label="Fins a" className={time} />
              <button type="button" aria-label="Esborrar la franja" onClick={() => { setList((l) => l.filter((_, j) => j !== i)); setDirty(true); }}
                      className="ml-auto grid size-9 place-items-center rounded-lg border border-line bg-surface text-fg-2 hover:bg-surface-2">
                <Trash2 size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => { setList((l) => [...l, { days: [6, 7], from: "10:00", to: "14:00", weight: 1 }]); setDirty(true); }}
              className="inline-flex items-center gap-1.5 self-start rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium">
        <Plus size={16} /> Afegir una franja
      </button>
      <label className="flex flex-col gap-1.5 text-sm text-fg-2">
        <span className="flex justify-between">
          <span>Fora d&apos;aquestes franges pots sortir…</span>
          <span className="font-medium text-fg">{OUTSIDE[Math.round(outsideWeight * 4)]}</span>
        </span>
        <input type="range" min={0} max={1} step={0.25} value={outsideWeight} className="accent-accent"
               onChange={(e) => { setOutsideWeight(Number(e.target.value)); setDirty(true); }} />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending || !dirty}
                className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-surface disabled:opacity-50">
          {pending ? "Desant…" : "Desar les franges"}
        </button>
        {message && <span className={`text-sm ${message.ok ? "text-going" : "text-gastro"}`}>{message.text}</span>}
      </div>
    </div>
  );
}
