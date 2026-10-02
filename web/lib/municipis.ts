// Còpia de pipeline/event_pipeline/data/municipis.json (Vercel només publica la carpeta web/).
import data from "./municipis.json";

export type Municipality = { name: string; lat: number; lon: number };

/** El conjunt de dades escriu "Bruc, el" i "Albi, l'" → "El Bruc", "L'Albi" (com geo.py). */
function display(name: string): string {
  const i = name.lastIndexOf(", ");
  if (i < 0) return name;
  const base = name.slice(0, i);
  const article = name.slice(i + 2);
  const cap = article.charAt(0).toUpperCase() + article.slice(1);
  return article.endsWith("'") ? `${cap}${base}` : `${cap} ${base}`;
}

function norm(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(l|el|la|els|les)\s+/, "");
}

const ALL: Municipality[] = (data.municipis as [string, number, number, string][])
  .map(([name, lat, lon]) => ({ name: display(name), lat, lon }))
  .sort((a, b) => a.name.localeCompare(b.name, "ca"));
const BY_NORM = new Map(ALL.map((m) => [norm(m.name), m]));

export const municipalityNames = (): string[] => ALL.map((m) => m.name);

export function findMunicipality(name: string): Municipality | undefined {
  return BY_NORM.get(norm(name));
}
