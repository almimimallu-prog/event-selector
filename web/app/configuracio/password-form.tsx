"use client";

import { useActionState } from "react";
import { setPassword, type PasswordState } from "./actions";

const input = "h-10 rounded-lg border border-line bg-bg px-3 outline-none focus:border-accent";

export function PasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, { status: "idle" });
  return (
    <form action={action} className="flex flex-col gap-2.5">
      {/* Camp ocult perquè el gestor de contrasenyes del navegador sàpiga de quin compte és. */}
      <input type="email" name="username" autoComplete="username" defaultValue={email} hidden readOnly />
      <label htmlFor="new-password" className="text-sm text-fg-2">Contrasenya nova (mínim 8 caràcters)</label>
      <input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required
             className={input} />
      <label htmlFor="confirm-password" className="text-sm text-fg-2">Repeteix-la</label>
      <input id="confirm-password" name="confirm" type="password" autoComplete="new-password" minLength={8} required
             className={input} />
      {state.status === "error" && <p className="text-sm text-gastro">{state.message}</p>}
      {state.status === "saved" && (
        <p className="text-sm text-going">Contrasenya desada. Ja pots entrar amb el correu i la contrasenya.</p>
      )}
      <button type="submit" disabled={pending}
              className="h-10 self-start rounded-lg bg-accent px-4 text-sm font-semibold text-surface disabled:opacity-60">
        {pending ? "Desant…" : "Desar la contrasenya"}
      </button>
    </form>
  );
}
