"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

// Missatges comprensibles per als errors més habituals de l'enllaç.
function explain(error: string): string {
  if (/code verifier|code_verifier|PKCE/i.test(error)) {
    return "L'enllaç s'ha obert en un navegador diferent del que el va demanar. Demana'n un de nou i obre'l en aquest mateix navegador.";
  }
  if (/expired|invalid|used|not found/i.test(error)) {
    return "L'enllaç ha caducat o ja s'ha fet servir. Demana'n un de nou.";
  }
  return `No s'ha pogut iniciar la sessió (${error}). Demana un enllaç nou.`;
}

function LinkError() {
  const error = useSearchParams().get("error");
  if (!error) return null;
  return <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">{explain(error)}</p>;
}

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex items-center gap-2 font-display text-2xl font-bold">
        <span className="size-3 rounded-[3px] bg-accent" />
        Event Selector
      </div>
      <Suspense>
        <LinkError />
      </Suspense>
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
