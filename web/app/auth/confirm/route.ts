import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Destí de l'enllaç del correu. Accepta els dos formats de Supabase:
//   ?code=…                      (plantilla per defecte, PKCE: cal obrir-lo al mateix navegador)
//   ?token_hash=…&type=magiclink (plantilla personalitzada: funciona des de qualsevol navegador)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const supabase = await createClient();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error("Falta el codi") };

  return NextResponse.redirect(new URL(error ? "/login?error=enllac" : "/", origin));
}
