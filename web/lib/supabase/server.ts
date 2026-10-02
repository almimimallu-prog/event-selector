import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Un client nou per a cada petició (mai compartit entre usuaris/peticions).
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Des d'un Server Component no es poden escriure cookies: ho fa el proxy.
        }
      },
    },
  });
}
