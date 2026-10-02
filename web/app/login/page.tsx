"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex items-center gap-2 font-display text-2xl font-bold">
        <span className="size-3 rounded-[3px] bg-accent" />
        Event Selector
      </div>
      {state.status === "sent" ? (
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="font-semibold">Revisa el correu</p>
          <p className="mt-1 text-sm text-fg-2">
            T&apos;hem enviat un enllaç per entrar. Obre&apos;l en aquest mateix navegador.
          </p>
        </div>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <label htmlFor="email" className="text-sm text-fg-2">
            Correu
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="nom@exemple.cat"
            className="h-11 rounded-lg border border-line bg-surface px-3 outline-none focus:border-accent"
          />
          {state.status === "error" && <p className="text-sm text-gastro">{state.message}</p>}
          <button
            type="submit"
            disabled={pending}
            className="h-11 rounded-lg bg-accent font-semibold text-surface disabled:opacity-60"
          >
            {pending ? "Enviant…" : "Envia'm l'enllaç"}
          </button>
        </form>
      )}
    </main>
  );
}
