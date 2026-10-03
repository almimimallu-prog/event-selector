import { AppNav, Brand } from "@/components/app-nav";
import { todayKey } from "@/lib/dates";
import { municipalityNames } from "@/lib/municipis";
import { AddForm } from "./add-form";

export const metadata = { title: "Afegir un pla · Event Selector" };

// Apuntar a mà un pla vist en qualsevol lloc (Time Out, un cartell, un amic...).
export default function AddPlanPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-3 pb-24">
      <header className="flex flex-wrap items-center gap-4"><Brand /><AppNav /></header>
      <h1 className="font-display text-2xl font-medium">Afegir un pla</h1>
      <AddForm today={todayKey()} />
      <datalist id="municipis">
        {municipalityNames().map((n) => <option key={n} value={n} />)}
      </datalist>
    </div>
  );
}
