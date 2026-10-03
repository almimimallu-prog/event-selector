import { notFound } from "next/navigation";
import { municipalityNames } from "@/lib/municipis";
import { AvailabilityEditor } from "../../configuracio/availability-editor";
import { BlockedWordsEditor, InterestsEditor } from "../../configuracio/interests-editor";
import { LearningSummary } from "../../configuracio/learning-summary";
import { type EditableSource, SourcesEditor } from "../../configuracio/sources-editor";
import { GeoEditor } from "@/components/geo-editor";

// Vista prèvia dels editors de Configuració amb dades inventades, NOMÉS en desenvolupament.
// Els botons criden les accions reals, que sense sessió no poden escriure res (RLS).
const ZONES = [
  { id: "1", name: "Igualada", radius_km: 30, active: true },
  { id: "2", name: "Barcelona", radius_km: 15, active: true },
];
const base = { url: "https://example.com/", last_error: null, consecutive_failures: 0, adapter: "llm" };
const SOURCES: EditableSource[] = [
  { ...base, id: "a", name: "Agenda Cultural de Catalunya", status: "active", discovered_via: "seed", last_success_at: new Date().toISOString(), adapter: "gencat" },
  { ...base, id: "b", name: "Teatre de l'Aurora", status: "active", discovered_via: "seed", last_success_at: new Date().toISOString() },
  { ...base, id: "c", name: "Eventbrite: The Wedding Market", status: "active", discovered_via: "manual", last_success_at: null, consecutive_failures: 2, last_error: "EventbriteError: Eventbrite 404: no existeix o no és públic", adapter: "eventbrite" },
  { ...base, id: "d", name: "Ateneu de Capellades", status: "paused", discovered_via: "manual", last_success_at: null },
];

const LEARNING = {
  categories: { cultura: { pos: 4, neg: 0 }, formacio_tech: { pos: 1, neg: 2 } },
  tags: { jazz: { pos: 3, neg: 0 }, "música": { pos: 4, neg: 0 }, networking: { pos: 0, neg: 2 } },
  far_km: 41.7, expensive_eur: 35, bad_slots: { "1-mati": 2 },
};

export default function DevSettingsPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-1 font-semibold">Municipis i radi</h2>
        <GeoEditor zones={ZONES} />
      </section>
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-1 font-semibold">Interessos</h2>
        <InterestsEditor weights={{ cultura: 0.75, esport_natura: 0.5, formacio_tech: 0.5, gastronomia_social: 0.25 }} learning={LEARNING} />
      </section>
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Paraules bloquejades</h2>
        <BlockedWordsEditor words={["infantil", "networking"]} />
      </section>
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Disponibilitat</h2>
        <AvailabilityEditor slots={[{ days: [1, 2, 3, 4, 5], from: "18:00", to: "23:59", weight: 1 }, { days: [6, 7], from: "00:00", to: "23:59", weight: 1 }]} outside={0.25} />
      </section>
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">El que he après de tu</h2>
        <LearningSummary learning={LEARNING} />
      </section>
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Fonts</h2>
        <SourcesEditor sources={SOURCES} />
      </section>
      <datalist id="municipis">
        {municipalityNames().map((n) => <option key={n} value={n} />)}
      </datalist>
    </div>
  );
}
