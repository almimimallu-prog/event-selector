import { AppNav, Brand } from "@/components/app-nav";
import { municipalityNames } from "@/lib/municipis";
import { loadReview } from "@/lib/review";
import { createClient } from "@/lib/supabase/server";
import { ReviewInbox } from "./review-inbox";

export const metadata = { title: "Per revisar · Event Selector" };

// Safata "Per revisar": possibles duplicats i plans que el pipeline ha retingut.
export default async function ReviewPage() {
  const supabase = await createClient();
  const { duplicates, held } = await loadReview(supabase);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-3 pb-24">
      <header className="flex flex-wrap items-center gap-4"><Brand /><AppNav /></header>
      <h1 className="font-display text-2xl font-medium">Per revisar</h1>
      <ReviewInbox duplicates={duplicates} held={held} />
      <datalist id="municipis">
        {municipalityNames().map((n) => <option key={n} value={n} />)}
      </datalist>
    </div>
  );
}
