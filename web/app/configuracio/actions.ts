"use server";

import { createClient } from "@/lib/supabase/server";

export type PasswordState = { status: "idle" | "saved" | "error"; message?: string };

export async function setPassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < 8) return { status: "error", message: "Ha de tenir com a mínim 8 caràcters." };
  if (password !== confirm) return { status: "error", message: "Les dues contrasenyes no coincideixen." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("updateUser(password):", error.status, error.message);
    if (/reauthenticat|recent/i.test(error.message)) {
      return { status: "error", message: "Per seguretat, torna a entrar amb l'enllaç del correu i crea-la just després." };
    }
    if (/weak|pwned|short/i.test(error.message)) {
      return { status: "error", message: "Contrasenya massa feble o coneguda. Tria'n una de més llarga i única." };
    }
    return { status: "error", message: `No s'ha pogut desar (${error.message}).` };
  }
  return { status: "saved" };
}
