"use server";

import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: "Escriu un correu vàlid." };
  }
  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  // Flux "implicit": l'enllaç porta la sessió dins l'adreça (#access_token=…) i funciona des de qualsevol
  // navegador (p. ex. obert des de l'app de Gmail). El flux PKCE de @supabase/ssr exigeix el mateix navegador
  // i la plantilla del correu no es pot canviar sense SMTP propi.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Els registres estan tancats: només l'usuari creat a Supabase pot entrar.
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    console.error("signInWithOtp:", error.status, error.message);
    if (error.status === 429 || /rate limit/i.test(error.message)) {
      return {
        status: "error",
        message: "Supabase només envia uns quants correus per hora i ja s'ha arribat al límit. Torna-ho a provar d'aquí a una hora.",
      };
    }
    if (/signups not allowed|not found/i.test(error.message)) {
      return { status: "error", message: "Aquest correu no té accés a l'app. Comprova que sigui el que vas registrar." };
    }
    return { status: "error", message: `No s'ha pogut enviar l'enllaç (${error.message}).` };
  }
  return { status: "sent" };
}
