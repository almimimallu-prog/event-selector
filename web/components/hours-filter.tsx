"use client";

// Filtre de franja horària: lliscador doble de 0 a 24 h (dues barres superposades).
export type Hours = [number, number];

export const hoursLabel = (h: Hours | null) => (h ? `${h[0]}–${h[1]} h` : "Qualsevol hora");

export function HoursPanel({ value, onChange }: { value: Hours | null; onChange: (h: Hours | null) => void }) {
  const [from, to] = value ?? [0, 24];
  const set = (f: number, t: number) => onChange(f === 0 && t === 24 ? null : [Math.min(f, t), Math.max(f, t)]);

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-fg-2">Hora d&apos;inici dels plans</span>
        <span className="font-medium tabular-nums">{value ? `De ${from} h a ${to} h` : "Qualsevol hora"}</span>
      </div>
      <div className="range-dual relative h-7">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-line" aria-hidden />
        <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded bg-accent" aria-hidden
             style={{ left: `${(from / 24) * 100}%`, right: `${100 - (to / 24) * 100}%` }} />
        <input type="range" min={0} max={24} step={1} value={from} aria-label="Des de les"
               onChange={(e) => set(Math.min(Number(e.target.value), to - 1), to)} />
        <input type="range" min={0} max={24} step={1} value={to} aria-label="Fins a les"
               onChange={(e) => set(from, Math.max(Number(e.target.value), from + 1))} />
      </div>
      <div className="flex justify-between text-[11px] text-fg-3 tabular-nums">
        <span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>24 h</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
        {([["Matí", 6, 14], ["Tarda", 14, 20], ["Després de la feina", 18, 24], ["Nit", 21, 24]] as const).map(([name, f, t]) => (
          <button key={name} type="button" onClick={() => set(f, t)}
                  className={`rounded-full border px-2.5 py-0.5 ${from === f && to === t ? "border-transparent bg-accent-soft text-accent" : "border-line text-fg-2"}`}>
            {name}
          </button>
        ))}
        {value && (
          <button type="button" onClick={() => onChange(null)} className="ml-auto font-medium text-accent underline">
            Qualsevol hora
          </button>
        )}
      </div>
      <p className="text-xs text-fg-3">Els plans de tot el dia (fires, exposicions) i els teus ⭐/✅ surten sempre.</p>
    </div>
  );
}
