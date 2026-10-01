// Pantalla provisional: el calendari arriba a la Fase 1, punt 5.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex items-center gap-2 font-display text-2xl font-bold">
        <span className="size-3 rounded-[3px] bg-accent" />
        Event Selector
      </div>
      <p className="max-w-prose text-fg-2">
        Tots els esdeveniments d&apos;Igualada, Barcelona i rodalia en un sol lloc. L&apos;app està en
        construcció (Fase 1).
      </p>
      <ul className="flex flex-wrap gap-2 text-sm font-medium">
        <li className="rounded-full bg-cultura-soft px-3 py-1 text-cultura">Cultura</li>
        <li className="rounded-full bg-esport-soft px-3 py-1 text-esport">Esport/natura</li>
        <li className="rounded-full bg-formacio-soft px-3 py-1 text-formacio">Formació/tech</li>
        <li className="rounded-full bg-gastro-soft px-3 py-1 text-gastro">Gastronomia/social</li>
      </ul>
    </main>
  );
}
