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
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
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
