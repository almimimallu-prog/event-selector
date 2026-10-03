import { notFound } from "next/navigation";
import type { DuplicatePair, HeldEvent } from "@/lib/review";
import { ReviewInbox } from "../../revisar/review-inbox";

// Vista prèvia de la safata "Per revisar" amb dades inventades, NOMÉS en desenvolupament.
const side = (id: string, title: string, sources: string[], extra = {}) => ({
  id, title, start_at: "2026-10-10T17:00:00Z", all_day: false, city: "Igualada", venue: "Teatre de l'Aurora",
  url: "https://example.com", summary: "Concert de jazz manouche", marked: false, sources, ...extra,
});
const DUPS: DuplicatePair[] = [
  { id: 1, score: 0.7, a: side("a", "Jazz a l'Aurora: trio manouche", ["Teatre de l'Aurora"]),
    b: side("b", "Trio Manouche en concert", ["Instagram: @teatreaurora"], { marked: true }) },
];
const HELD: HeldEvent[] = [
  { id: "h", title: "Concert íntim: Montse Castellà i Borja Penalba", start_at: "2026-10-11T18:00:00Z", all_day: false,
    city: null, url: "https://example.com", summary_ca: "Concert de cançons de Joan Baez", review_reasons: ["sense lloc"],
    confidence: 0.9, sources: ["Instagram: @ajigualada"] },
];

export default function DevReviewPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <div className="mx-auto max-w-3xl px-4 py-6"><ReviewInbox duplicates={DUPS} held={HELD} /></div>;
}
