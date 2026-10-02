"use client";

import Link from "next/link";
import { useHashSession } from "@/components/use-hash-session";

// Destí de l'enllaç del correu (flux implicit): la sessió arriba a l'adreça, després de #.
export default function AuthCallback() {
  const { error } = useHashSession();
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-4 py-16">
      {error ? (
        <>
          <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">
            L&apos;enllaç ha caducat o ja s&apos;ha fet servir ({error}).
          </p>
          <Link href="/login" className="text-accent underline">Demana un enllaç nou</Link>
        </>
      ) : (
        <p className="text-fg-2">Entrant…</p>
      )}
    </main>
  );
}
