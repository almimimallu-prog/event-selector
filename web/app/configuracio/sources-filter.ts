/** Cerca i filtres de la llista de fonts (Configuració → Fonts). Lògica pura, sense React. */

export type SourceKind = "instagram" | "web" | "eventbrite" | "calendar";
export type StatusFilter = "all" | "active" | "paused" | "errors";

export interface FilterableSource {
  name: string;
  url: string | null;
  status: string;
  consecutive_failures: number;
  adapter: string | null;
}

export const KIND_LABELS: Record<SourceKind, string> = {
  instagram: "Instagram",
  web: "Webs",
  eventbrite: "Eventbrite",
  calendar: "Calendaris",
};

export const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "Totes",
  active: "Actives",
  paused: "Pausades",
  errors: "Amb errors",
};

export function sourceKind(source: Pick<FilterableSource, "adapter">): SourceKind {
  if (source.adapter === "instagram") return "instagram";
  if (source.adapter === "eventbrite") return "eventbrite";
  if (source.adapter === "ics") return "calendar";
  return "web";
}

/** Minúscules i sense accents: «Cafè» troba «cafe». */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/** El que s'escriu a la cerca → text a buscar. '@compte' i 'instagram.com/compte' → 'compte'. */
export function searchTerm(query: string): string {
  const q = normalize(query);
  const insta = q.match(/instagram\.com\/([a-z0-9_.]+)/);
  if (insta) return insta[1];
  return q.replace(/^@/, "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
}

function matchesStatus(source: FilterableSource, status: StatusFilter): boolean {
  if (status === "active") return source.status === "active";
  if (status === "paused") return source.status !== "active";
  if (status === "errors") return source.status === "active" && source.consecutive_failures > 0;
  return true;
}

export function filterSources<T extends FilterableSource>(
  sources: readonly T[],
  { query, kind, status }: { query: string; kind: SourceKind | "all"; status: StatusFilter },
): T[] {
  const term = searchTerm(query);
  return sources.filter(
    (s) =>
      (kind === "all" || sourceKind(s) === kind) &&
      matchesStatus(s, status) &&
      (!term || normalize(`${s.name} ${s.url ?? ""}`).includes(term)),
  );
}

/** Si el que s'ha cercat sembla una font que es pot afegir (@compte o enllaç), el text per al formulari. */
export function addableFromQuery(query: string): string | null {
  const q = query.trim();
  if (/^@[A-Za-z0-9_.]{1,30}$/.test(q) || /instagram\.com\/[A-Za-z0-9_.]+/.test(q)) return q;
  if (/^https?:\/\/\S+\.\S+/.test(q)) return q;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(q)) return `https://${q}`;
  return null;
}
