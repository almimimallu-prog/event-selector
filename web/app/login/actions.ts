"use server";

import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 8;
const RATE_LIMITED =
  "Supabase només envia uns quants correus per hora i ja s'ha arribat al límit. Torna-ho a provar d'aquí a una hora.";

async function appOrigin(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

// Flux "implicit": l'enllaç del correu porta la sessió dins l'adreça (#access_token=…) i funciona des de
// qualsevol navegador (p. ex. obert des de l'app de Gmail). El flux PKCE de @supabase/ssr exigeix el mateix
// navegador i la plantilla del correu no es pot canviar sense SMTP propi.
function implicitClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false },
  });
}

const isRateLimited = (error: { status?: number; message: string }) =>
  error.status === 429 || /rate limit/i.test(error.message);

export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  if (!EMAIL.test(email)) {
    return { status: "error", message: "Escriu un correu vàlid." };
  }
  const { error } = await implicitClient().auth.signInWithOtp({
    email,
    // Per entrar, no per registrar-se: els comptes nous es creen a "Crear compte" (amb contrasenya).
    options: { shouldCreateUser: false, emailRedirectTo: `${await appOrigin()}/auth/callback` },
  });
  if (error) {
    console.error("signInWithOtp:", error.status, error.message);
    if (isRateLimited(error)) return { status: "error", message: RATE_LIMITED };
    if (/signups not allowed|not found/i.test(error.message)) {
      return { status: "error", message: "Aquest correu encara no té compte. Crea'l a «Crear compte»." };
    }
    return { status: "error", message: `No s'ha pogut enviar l'enllaç (${error.message}).` };
  }
  return { status: "sent" };
}

/** Registre obert: correu + contrasenya. Supabase envia un correu per confirmar l'adreça (si està activat). */
export async function signUp(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!EMAIL.test(email)) return { status: "error", email, message: "Escriu un correu vàlid." };
  if (password.length < MIN_PASSWORD) {
    return { status: "error", email, message: `La contrasenya ha de tenir com a mínim ${MIN_PASSWORD} caràcters.` };
  }
  const { data, error } = await implicitClient().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await appOrigin()}/auth/callback` },
  });
  if (error) {
    console.error("signUp:", error.status, error.message);
    if (isRateLimited(error)) return { status: "error", email, message: RATE_LIMITED };
    if (/signups not allowed/i.test(error.message)) {
      return { status: "error", email, message: "Ara mateix no s'accepten registres nous." };
    }
    if (/already registered|already exists/i.test(error.message)) {
      return { status: "error", email, message: "Aquest correu ja té compte. Entra amb la contrasenya o amb l'enllaç." };
    }
    if (/password/i.test(error.message)) {
      return { status: "error", email, message: `La contrasenya no és vàlida (${error.message}).` };
    }
    return { status: "error", email, message: `No s'ha pogut crear el compte (${error.message}).` };
  }
  // Correu ja registrat i confirmat: Supabase no ho diu (per no revelar-ho) i retorna un usuari sense identitats.
  if (data.user && data.user.identities?.length === 0) {
    return { status: "error", email, message: "Aquest correu ja té compte. Entra amb la contrasenya o amb l'enllaç." };
  }
  // Sense confirmació de correu (desactivada a Supabase): ja es pot entrar directament.
  if (data.session) {
    const supabase = await createServerClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (!signInError) redirect("/");
  }
  return { status: "sent", email };
}

export async function signInWithPassword(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { status: "error", message: "Escriu el correu i la contrasenya." };
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("signInWithPassword:", error.status, error.message);
    if (/invalid login credentials/i.test(error.message)) {
      return {
        status: "error",
        email,
        message: "Correu o contrasenya incorrectes. Si encara no has creat la contrasenya, entra amb l'enllaç i crea-la a Configuració.",
      };
    }
    return { status: "error", email, message: `No s'ha pogut entrar (${error.message}).` };
  }
  redirect("/");
}
