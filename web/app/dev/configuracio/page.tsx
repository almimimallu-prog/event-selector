import { notFound } from "next/navigation";
import { municipalityNames } from "@/lib/municipis";
import { type EditableSource, SourcesEditor } from "../../configuracio/sources-editor";
import { ZonesEditor } from "../../configuracio/zones-editor";

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

export default function DevSettingsPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Zones</h2>
        <ZonesEditor zones={ZONES} />
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
