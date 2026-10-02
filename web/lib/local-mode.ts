import type { AppEvent, Zone } from "./types";

// Mode "Sense sortir d'Igualada": només el que passa a prop del centre de la zona principal
// (la primera zona activa). 5 km inclou la conca d'Òdena: Vilanova del Camí, Montbui, Òdena.
export const LOCAL_RADIUS_KM = 5;
// Es recorda en una galeta perquè valgui per a totes les pestanyes fins que es desactivi.
export const LOCAL_COOKIE = "a_prop";

export function homeZone(zones: Zone[]): Zone | undefined {
  return zones.find((z) => z.active);
}

export function isNearHome(event: AppEvent, home: Zone): boolean {
  if (event.zone_name === home.name && event.zone_km != null) return event.zone_km <= LOCAL_RADIUS_KM;
  // Sense coordenades: ens refiem del municipi.
  return event.zone_km == null && event.city?.toLowerCase() === home.name.toLowerCase();
}

/** "d'Igualada", "de Barcelona". */
export function ofPlace(name: string): string {
  return /^[aeiouàèéíòóúh]/i.test(name) ? `d'${name}` : `de ${name}`;
}
