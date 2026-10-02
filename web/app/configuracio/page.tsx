import { LogOut, MapPin } from "lucide-react";
import { redirect } from "next/navigation";
import { AppNav, Brand } from "@/components/app-nav";
import { loadSettings } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Configuració · Event Selector" };

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Primera versió: consulta. L'edició de zones, disponibilitat i fonts arriba a la Fase 2.
export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ zones, prefs }, sources, claims] = await Promise.all([
    loadSettings(supabase),
    supabase.from("sources").select("name, status, last_success_at, consecutive_failures").order("name"),
    supabase.auth.getClaims(),
  ]);
  const days = ["", "Dl", "Dm", "Dc", "Dj", "Dv", "Ds", "Dg"];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-3 pb-24">
      <header className="flex flex-wrap items-center gap-4"><Brand /><AppNav /></header>
      <h1 className="font-display text-2xl font-medium">Configuració</h1>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Zones</h2>
        <ul className="grid gap-2">
          {zones.map((z) => (
            <li key={z.id} className="flex items-center gap-2 text-sm">
              <MapPin size={16} className="text-accent" /> {z.name} · radi de {z.radius_km} km
              {!z.active && <span className="text-fg-3">(desactivada)</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Disponibilitat</h2>
        <ul className="grid gap-1 text-sm text-fg-2">
          {prefs.availability.map((s, i) => (
            <li key={i}>{s.days.map((d) => days[d]).join(", ")} · de {s.from} a {s.to}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Fonts</h2>
        <ul className="grid gap-2 text-sm">
          {(sources.data ?? []).map((s) => (
            <li key={s.name} className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${s.consecutive_failures >= 3 ? "bg-gastro" : s.consecutive_failures > 0 ? "bg-star" : "bg-going"}`} />
                {s.name}
              </span>
              <span className="text-fg-3">
                {s.last_success_at ? `Actualitzada ${new Date(s.last_success_at).toLocaleString("ca", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" })}` : "Pendent"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-1 font-semibold">Contrasenya</h2>
        <p className="mb-3 text-sm text-fg-2">
          Amb una contrasenya pots entrar sense esperar el correu (Supabase només n&apos;envia uns quants per hora).
        </p>
        <PasswordForm email={String(claims.data?.claims?.email ?? "")} />
      </section>

      <form action={signOut} className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-2">
        <span>Sessió iniciada com a {String(claims.data?.claims?.email ?? "")}</span>
        <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 font-medium">
          <LogOut size={16} /> Tancar la sessió
        </button>
      </form>
    </div>
  );
}
