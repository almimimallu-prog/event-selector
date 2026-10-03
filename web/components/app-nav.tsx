"use client";

import { CalendarDays, CircleCheck, GraduationCap, Image as ImageIcon, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Calendari", short: "Calendari", icon: CalendarDays },
  { href: "/exposicions", label: "Exposicions", short: "Exposicions", icon: ImageIcon },
  { href: "/cursos", label: "Cursos", short: "Cursos", icon: GraduationCap },
  { href: "/plans", label: "Els meus plans", short: "Plans", icon: CircleCheck },
  { href: "/configuracio", label: "Configuració", short: "Ajustos", icon: Settings },
];
// Només a l'escriptori (al mòbil s'hi arriba des de Configuració, per no afegir una sisena icona).
const DESKTOP_ONLY = [{ href: "/revisar", label: "Per revisar" }];

/** Escriptori: pestanyes a la capçalera. Mòbil: barra inferior fixa. */
export function AppNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <nav className="hidden gap-1 md:flex" aria-label="Seccions">
        {[...ITEMS.slice(0, 4), ...DESKTOP_ONLY, ITEMS[4]].map(({ href, label }) => (
          <Link key={href} href={href}
                className={`rounded-full px-3 py-1 text-sm font-medium ${active(href) ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-surface-2"}`}>
            {label}
          </Link>
        ))}
      </nav>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Seccions"
      >
        {ITEMS.map(({ href, label, short, icon: Icon }) => (
          <Link key={href} href={href} aria-label={label}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${active(href) ? "text-accent" : "text-fg-3"}`}>
            <Icon size={21} />
            {short}
          </Link>
        ))}
      </nav>
    </>
  );
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
      <span className="size-2.5 rounded-[3px] bg-accent" />
      Event Selector
    </Link>
  );
}
