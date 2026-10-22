import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Figtree({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Event Selector",
  description: "Tots els esdeveniments d'Igualada, Barcelona i rodalia en un sol lloc.",
  applicationName: "Event Selector",
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
  appleWebApp: { capable: true, title: "Events", statusBarStyle: "default" },
  // El traductor de Chrome substitueix els textos per <font> propis i React deixa d'actualitzar la llista
  // (es queda buida o congelada en cercar o marcar «Hi vaig»): l'app és en català i no s'ha de traduir.
  other: { google: "notranslate" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f2" },
    { media: "(prefers-color-scheme: dark)", color: "#141716" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ca" translate="no" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
