// Límits del filtre geogràfic (Configuració → Zones). Fora del fitxer d'accions perquè un fitxer
// "use server" només pot exportar funcions.
export const MAX_ZONES = 2;
export const MIN_KM = 0; // 0 = només el municipi
export const MAX_KM = 200;

/** "Igualada · 30 km" o "Igualada (només el municipi)". */
export function zoneLabel(z: { name: string; radius_km: number }): string {
  return z.radius_km > 0 ? `${z.name} · ${z.radius_km} km` : `${z.name} (només el municipi)`;
}
