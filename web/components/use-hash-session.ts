"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Recull la sessió que porta l'enllaç del correu a l'adreça (#access_token=…&refresh_token=…),
 * la desa a les galetes (perquè el servidor la vegi) i torna a l'inici.
 * Retorna l'error de l'enllaç, si n'hi ha, o "working" mentre treballa.
 */
export function useHashSession(): { working: boolean; error: string | null } {
  const [state, setState] = useState<{ working: boolean; error: string | null }>({ working: false, error: null });

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const errorDescription = hash.get("error_description");
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (!errorDescription && !(accessToken && refreshToken)) return;

    // L'adreça amb els tokens no s'ha de quedar a l'historial.
    window.history.replaceState(null, "", window.location.pathname);
    if (errorDescription) {
      queueMicrotask(() => setState({ working: false, error: errorDescription }));
      return;
    }
    queueMicrotask(() => setState({ working: true, error: null }));
    createClient()
      .auth.setSession({ access_token: accessToken!, refresh_token: refreshToken! })
      .then(({ error }) => {
        if (error) setState({ working: false, error: error.message });
        else window.location.replace("/");
      });
  }, []);

  return state;
}
