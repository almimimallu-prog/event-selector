import { notFound } from "next/navigation";
import { todayKey } from "@/lib/dates";
import { AddForm } from "../../plans/nou/add-form";

// Vista prèvia del formulari "Afegir un pla", NOMÉS en desenvolupament (sense sessió no desa res).
export default function DevAddPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <div className="mx-auto max-w-2xl px-4 py-6"><AddForm today={todayKey()} /></div>;
}
