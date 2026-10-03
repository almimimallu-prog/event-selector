import { ChevronRight, Inbox, LogOut } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav, Brand } from "@/components/app-nav";
import { loadSettings } from "@/lib/data";
import { municipalityNames } from "@/lib/municipis";
import { reviewCount } from "@/lib/review";
import { createClient } from "@/lib/supabase/server";
import { AvailabilityEditor } from "./availability-editor";
import { BlockedWordsEditor, InterestsEditor } from "./interests-editor";
import { LearningSummary } from "./learning-summary";
import { PasswordForm } from "./password-form";
import { type EditableSource, SourcesEditor } from "./sources-editor";
import { GeoEditor } from "@/components/geo-editor";

export const metadata = { title: "Configuració · Event Selector" };

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ zones, prefs }, sources, claims, toReview] = await Promise.all([
    loadSettings(supabase),
    supabase
      .from("sources")
      .select("id, name, url, status, discovered_via, last_success_at, last_error, consecutive_failures, config")
      .in("status", ["active", "paused"])
      .neq("type", "manual") // "Afegits a mà": font interna dels plans apuntats a mà
      .order("name"),
    supabase.auth.getClaims(),
    reviewCount(supabase),
  ]);
  const sourceRows: EditableSource[] = (sources.data ?? []).map(({ config, ...s }) => ({
    ...s,
    adapter: (config as { adapter?: string } | null)?.adapter ?? null,
  }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-3 pb-24">
      <header className="flex flex-wrap items-center gap-4"><Brand /><AppNav /></header>
      <h1 className="font-display text-2xl font-medium">Configuració</h1>

      <Link href="/revisar" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:bg-surface-2">
        <Inbox size={20} className="text-accent" />
        <span className="flex-1">
          <span className="font-semibold">Per revisar</span>
          <span className="block text-sm text-fg-2">
            {toReview > 0 ? `${toReview} pendents: possibles duplicats i plans retinguts` : "Res pendent"}
          </span>
        </span>
        <ChevronRight size={18} className="text-fg-3" />
      </Link>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-1 font-semibold">Municipis i radi</h2>
        <GeoEditor zones={zones.filter((z) => z.active)} />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-1 font-semibold">Interessos</h2>
        <InterestsEditor weights={prefs.category_weights} learning={prefs.learning} />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Paraules bloquejades</h2>
        <BlockedWordsEditor words={prefs.blocked_tags} />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Disponibilitat</h2>
        <AvailabilityEditor slots={prefs.availability} outside={prefs.default_availability_weight} />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">El que he après de tu</h2>
        <LearningSummary learning={prefs.learning} />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Fonts</h2>
        <SourcesEditor sources={sourceRows} />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-1 font-semibold">Contrasenya</h2>
        <p className="mb-3 text-sm text-fg-2">
          Amb una contrasenya pots entrar sense esperar el correu (Supabase només n&apos;envia uns quants per hora).
        </p>
        <PasswordForm email={String(claims.data?.claims?.email ?? "")} />
      </section>

      <datalist id="municipis">
        {municipalityNames().map((n) => <option key={n} value={n} />)}
      </datalist>

      <form action={signOut} className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-2">
        <span>Sessió iniciada com a {String(claims.data?.claims?.email ?? "")}</span>
        <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 font-medium">
          <LogOut size={16} /> Tancar la sessió
        </button>
      </form>
    </div>
  );
}
