"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState, useState } from "react";
import { useHashSession } from "@/components/use-hash-session";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";

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

const input = "h-11 rounded-lg border border-line bg-surface px-3 outline-none focus:border-accent";
const submit = "h-11 rounded-lg bg-accent font-semibold text-surface disabled:opacity-60";

export default function LoginPage() {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [linkState, linkAction, linkPending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });
  const [passState, passAction, passPending] = useActionState<LoginState, FormData>(signInWithPassword, { status: "idle" });
  // Si Supabase envia l'enllaç a l'inici (Site URL), la sessió arriba aquí després del #.
  const hashSession = useHashSession();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex items-center gap-2 font-display text-2xl font-bold">
        <span className="size-3 rounded-[3px] bg-accent" />
        Event Selector
      </div>
      <Suspense>
        <LinkError />
      </Suspense>
      {hashSession.error && (
        <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">{explain(hashSession.error)}</p>
      )}

      {hashSession.working ? (
        <p className="text-fg-2">Entrant…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 rounded-lg border border-line bg-surface p-1 text-sm font-medium" role="tablist">
            {(["password", "link"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                      className={`rounded-md py-1.5 ${mode === m ? "bg-accent-soft text-accent" : "text-fg-2"}`}>
                {m === "password" ? "Contrasenya" : "Enllaç al correu"}
              </button>
            ))}
          </div>

          {mode === "password" ? (
            <form action={passAction} className="flex flex-col gap-3">
              <label htmlFor="email" className="text-sm text-fg-2">Correu</label>
              {/* key: el formulari es buida després de cada intent; així el correu es conserva. */}
              <input key={passState.email} id="email" name="email" type="email" autoComplete="username" required
                     defaultValue={passState.email} placeholder="nom@exemple.cat" className={input} />
              <label htmlFor="password" className="text-sm text-fg-2">Contrasenya</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required
                     className={input} />
              {passState.status === "error" && <p className="text-sm text-gastro">{passState.message}</p>}
              <button type="submit" disabled={passPending} className={submit}>
                {passPending ? "Entrant…" : "Entrar"}
              </button>
              <p className="text-xs text-fg-3">
                Encara no tens contrasenya? Entra amb l&apos;enllaç al correu i crea-la a Configuració.
              </p>
            </form>
          ) : linkState.status === "sent" ? (
            <div className="rounded-xl border border-line bg-surface p-5">
              <p className="font-semibold">Revisa el correu</p>
              <p className="mt-1 text-sm text-fg-2">
                T&apos;hem enviat un enllaç per entrar. El pots obrir des de qualsevol navegador o dispositiu.
              </p>
            </div>
          ) : (
            <form action={linkAction} className="flex flex-col gap-3">
              <label htmlFor="email-link" className="text-sm text-fg-2">Correu</label>
              <input id="email-link" name="email" type="email" autoComplete="email" required
                     placeholder="nom@exemple.cat" className={input} />
              {linkState.status === "error" && <p className="text-sm text-gastro">{linkState.message}</p>}
              <button type="submit" disabled={linkPending} className={submit}>
                {linkPending ? "Enviant…" : "Envia'm l'enllaç"}
              </button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
