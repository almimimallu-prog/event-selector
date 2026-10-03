"use client";

import { CheckCircle2, Star } from "lucide-react";
import { useActionState } from "react";
import { CATEGORIES } from "@/lib/categories";
import type { Category } from "@/lib/types";
import { type AddState, addPlan } from "./actions";

const input = "h-11 min-w-0 rounded-lg border border-line bg-bg px-3 outline-none focus:border-accent";
const label = "flex flex-col gap-1 text-sm text-fg-2";
// Classes escrites senceres perquè Tailwind les generi.
const CHECKED: Record<Category, string> = {
  cultura: "has-[:checked]:bg-cultura-soft has-[:checked]:text-cultura",
  esport_natura: "has-[:checked]:bg-esport-soft has-[:checked]:text-esport",
  formacio_tech: "has-[:checked]:bg-formacio-soft has-[:checked]:text-formacio",
  gastronomia_social: "has-[:checked]:bg-gastro-soft has-[:checked]:text-gastro",
  dating: "has-[:checked]:bg-dating-soft has-[:checked]:text-dating",
};

export function AddForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<AddState, FormData>(addPlan, { status: "idle" });
  return (
    <form action={action} className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5">
      <label className={label}>
        Què és? *
        <input name="title" required minLength={3} placeholder="p. ex. Concert de jazz a l'Apolo" className={input} />
      </label>
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <label className={`${label} min-w-0`}>Dia *<input name="day" type="date" required defaultValue={today} className={`${input} w-full min-w-0 px-2`} /></label>
        <label className={`${label} min-w-0`}>Des de<input name="from" type="time" className={`${input} w-full min-w-0 px-2`} /></label>
        <label className={`${label} min-w-0`}>Fins a<input name="to" type="time" className={`${input} w-full min-w-0 px-2`} /></label>
      </div>
      <p className="-mt-2 text-xs text-fg-3">Sense hora, el pla queda com a «tot el dia».</p>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm text-fg-2">Categoria *</legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CATEGORIES) as Category[]).map((c, i) => {
            const { label: name, icon: Icon } = CATEGORIES[c];
            return (
              <label key={c} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm has-[:checked]:border-transparent ${CHECKED[c]}`}>
                <input type="radio" name="category" value={c} defaultChecked={i === 0} className="sr-only" />
                <Icon size={15} aria-hidden /> {name}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={label}>Municipi<input name="city" list="municipis" autoComplete="off" placeholder="Barcelona" className={input} /></label>
        <label className={label}>Lloc<input name="venue" placeholder="Sala, teatre, plaça…" className={input} /></label>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <label className={label}>Enllaç<input name="url" type="url" inputMode="url" placeholder="https://…" className={input} /></label>
        <label className={label}>Preu<input name="price" placeholder="12 €, gratuït…" className={input} /></label>
      </div>
      <label className={label}>Nota personal<input name="note" placeholder="Amb qui hi vaig, què he de portar…" className={input} /></label>
      <fieldset className="flex gap-2">
        <legend className="sr-only">Marca</legend>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium has-[:checked]:border-transparent has-[:checked]:bg-warn-bg has-[:checked]:text-warn-fg">
          <input type="radio" name="state" value="interested" defaultChecked className="sr-only" /><Star size={16} /> M&apos;interessa
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium has-[:checked]:border-transparent has-[:checked]:bg-accent has-[:checked]:text-surface">
          <input type="radio" name="state" value="going" className="sr-only" /><CheckCircle2 size={16} /> Hi vaig
        </label>
      </fieldset>
      {state.status === "error" && <p className="text-sm text-gastro">{state.message}</p>}
      <button type="submit" disabled={pending}
              className="h-11 rounded-lg bg-accent font-semibold text-surface disabled:opacity-60">
        {pending ? "Desant…" : "Afegir el pla"}
      </button>
    </form>
  );
}
