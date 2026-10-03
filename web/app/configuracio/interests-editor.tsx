"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { CATEGORIES } from "@/lib/categories";
import type { Category, Learning } from "@/lib/types";
import { setBlockedWords, setCategoryWeight } from "./prefs-actions";

const LEVELS = ["Gens", "Poc", "Normal", "Bastant", "Molt"];
const levelOf = (w: number) => LEVELS[Math.round(w * 4)];

function CategoryRow({ category, weight, learned, onError }: {
  category: Category; weight: number; learned?: { pos: number; neg: number }; onError: (m: string | null) => void;
}) {
  const { label, icon: Icon, text } = CATEGORIES[category];
  const [value, setValue] = useState(weight);
  const [pending, start] = useTransition();
  const save = () => value !== weight && start(async () => onError(await setCategoryWeight(category, value)));

  return (
    <li className={`flex flex-col gap-1.5 py-2.5 ${pending ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2 text-sm">
        <Icon size={16} className={text} aria-hidden />
        <span className="flex-1 font-medium">{label}</span>
        {learned && (learned.pos > 0 || learned.neg > 0) && (
          <span className="text-xs text-fg-3" title="Plans marcats amb ⭐/✅ i descartats per «no m'interessa el tema»">
            après: {learned.pos > 0 && `+${learned.pos}`}{learned.pos > 0 && learned.neg > 0 && " "}{learned.neg > 0 && `−${learned.neg}`}
          </span>
        )}
        <span className="w-16 text-right font-medium">{levelOf(value)}</span>
      </div>
      <input type="range" min={0} max={1} step={0.25} value={value} aria-label={`Interès per ${label}`}
             className="w-full accent-accent" onChange={(e) => setValue(Number(e.target.value))}
             onPointerUp={save} onKeyUp={save} onBlur={save} />
    </li>
  );
}

export function InterestsEditor({ weights, learning }: { weights: Partial<Record<Category, number>>; learning: Learning }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-line">
        {(Object.keys(CATEGORIES) as Category[]).map((c) => (
          <CategoryRow key={c} category={c} weight={weights[c] ?? 0.5} learned={learning.categories[c]} onError={setError} />
        ))}
      </ul>
      {error && <p className="text-sm text-gastro">{error}</p>}
      <p className="text-xs text-fg-3">
        És el punt de partida: cada ⭐ o ✅ hi suma, i cada descart per «no m&apos;interessa el tema» hi resta.
        Per amagar del tot una categoria un dia concret, fes servir els filtres ràpids de la pantalla principal.
      </p>
    </div>
  );
}

export function BlockedWordsEditor({ words }: { words: string[] }) {
  const [list, setList] = useState(words);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(next: string[]) {
    const previous = list;
    setList(next);
    start(async () => {
      const e = await setBlockedWords(next);
      if (e) setList(previous);
      setError(e);
    });
  }

  function add() {
    const w = draft.trim().toLowerCase();
    if (w.length < 2 || list.includes(w)) return setDraft("");
    save([...list, w]);
    setDraft("");
  }

  return (
    <div className={`flex flex-col gap-2.5 ${pending ? "opacity-70" : ""}`}>
      {list.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {list.map((w) => (
            <li key={w} className="inline-flex items-center gap-1 rounded-full border border-line bg-bg py-0.5 pr-1 pl-3 text-sm">
              {w}
              <button type="button" aria-label={`Treure «${w}»`} onClick={() => save(list.filter((x) => x !== w))}
                      className="grid size-6 place-items-center rounded-full text-fg-3 hover:bg-surface-2">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="p. ex. infantil, networking, en anglès"
               aria-label="Paraula a bloquejar" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
               className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 outline-none focus:border-accent" />
        <button type="button" onClick={add} disabled={pending}
                className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-surface disabled:opacity-60">
          Afegir
        </button>
      </div>
      {error && <p className="text-sm text-gastro">{error}</p>}
      <p className="text-xs text-fg-3">
        Els plans que tinguin alguna d&apos;aquestes paraules al títol, l&apos;explicació, el lloc o les etiquetes no surten.
        Els que ja has marcat amb ⭐ o ✅ sí. «infantil» també bloqueja «infantils».
      </p>
    </div>
  );
}
