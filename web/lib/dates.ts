// Dates en hora de Catalunya (Europe/Madrid), independentment de la zona del servidor o del navegador.

export const TZ = "Europe/Madrid";
export const WEEKDAYS_SHORT = ["Dl", "Dm", "Dc", "Dj", "Dv", "Ds", "Dg"];
export const WEEKDAYS = ["Dilluns", "Dimarts", "Dimecres", "Dijous", "Divendres", "Dissabte", "Diumenge"];
export const MONTHS = ["gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre",
  "octubre", "novembre", "desembre"];
export const MONTHS_SHORT = ["gen", "febr", "març", "abr", "maig", "juny", "jul", "ag", "set", "oct", "nov", "des"];

const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  hourCycle: "h23", weekday: "short",
});
const WD: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Parts locals a Madrid. weekday: 0 = dilluns. */
export function local(date: Date | string) {
  const p = Object.fromEntries(partsFormat.formatToParts(new Date(date)).map((x) => [x.type, x.value]));
  return {
    year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute,
    weekday: WD[p.weekday], key: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}`,
  };
}

/** Instant UTC corresponent a les 00:00 del dia indicat a Madrid. */
export function madridMidnight(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  const l = local(guess);
  const offsetMin = (Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute) - guess.getTime()) / 60000;
  return new Date(guess.getTime() - offsetMin * 60000);
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function todayKey(): string {
  return local(new Date()).key;
}

/** Dilluns de la setmana que conté el dia. */
export function weekStart(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(key, -wd);
}

export function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return `${WEEKDAYS[wd]} ${d} de ${MONTHS[m - 1]}`.replace(" de octubre", " d'octubre").replace(" de abril", " d'abril")
    .replace(" de agost", " d'agost");
}

export function shortDate(date: string): string {
  const l = local(date);
  return `${l.day} ${MONTHS_SHORT[l.month - 1]}`;
}

export function isValidKey(key: string | undefined): key is string {
  return !!key && /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(Date.parse(key));
}
