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

  // Supabase també pot tornar amb ?error=…&error_description=… (enllaç caducat o ja utilitzat).
  if (searchParams.get("error_description")) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(searchParams.get("error_description")!)}`, origin));
  }

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error("L'enllaç no porta cap codi") };

  if (error) {
    console.error("auth/confirm:", error.message);
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, origin));
  }
  return NextResponse.redirect(new URL("/", origin));
}
