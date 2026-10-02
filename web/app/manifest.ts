import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Event Selector",
    short_name: "Events",
    description: "Tots els esdeveniments d'Igualada, Barcelona i rodalia en un sol lloc.",
    lang: "ca",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f4f2",
    theme_color: "#2f5d50",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android retalla la icona amb la seva forma: versió amb marge i fons ple.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Android: "Compartir → Event Selector" des d'Instagram, WhatsApp, etc. (Fase 2)
    share_target: {
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [{ name: "media", accept: ["image/*", "application/pdf"] }],
      },
    },
  };
}
