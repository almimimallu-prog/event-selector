import type { Learning } from "@/lib/types";

const DAYS = ["", "dilluns", "dimarts", "dimecres", "dijous", "divendres", "dissabte", "diumenge"];
const PARTS: Record<string, string> = { mati: "al matí", tarda: "a la tarda", nit: "al vespre" };

/** Resum llegible del que s'ha après de les marques (⭐ ✅ ✕ + motiu). */
export function LearningSummary({ learning }: { learning: Learning }) {
  const tags = Object.entries(learning.tags).map(([t, c]) => ({ t, s: c.pos - c.neg }));
  const liked = tags.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6).map((x) => x.t);
  const disliked = tags.filter((x) => x.s < 0).sort((a, b) => a.s - b.s).slice(0, 6).map((x) => x.t);
  const slots = Object.entries(learning.bad_slots).filter(([, n]) => n >= 2).map(([k]) => {
    const [d, p] = k.split("-");
    return `${DAYS[Number(d)]} ${PARTS[p]}`;
  });
  const lines = [
    liked.length > 0 && <>T&apos;agraden: <b>{liked.join(", ")}</b></>,
    disliked.length > 0 && <>No t&apos;interessen: <b>{disliked.join(", ")}</b></>,
    learning.far_km != null && <>A més de <b>{Math.round(learning.far_km)} km</b> de la zona principal et sembla lluny</>,
    learning.expensive_eur != null && <>A partir de <b>{Math.round(learning.expensive_eur)} €</b> et sembla car</>,
    slots.length > 0 && <>Et van malament: <b>{slots.join(", ")}</b></>,
  ].filter(Boolean);

  if (!lines.length) {
    return (
      <p className="text-sm text-fg-2">
        Encara no he après res. Marca plans amb ⭐ o ✅ i, quan en descartis un, digues el motiu: així el rànquing s&apos;adapta a tu.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-sm text-fg-2">
      <ul className="flex list-disc flex-col gap-1 pl-5">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <p className="text-xs text-fg-3">
        Es calcula a partir dels plans que has marcat: si en desmarques un, se&apos;n desfà l&apos;efecte. Calen dos descarts
        pel mateix motiu (lluny, car o horari) abans que compti.
      </p>
    </div>
  );
}
