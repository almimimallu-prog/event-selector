// Comprovació de robots.txt abans d'afegir una font: si el web demana no ser llegit automàticament, no s'afegeix.
// Mateix identificador que el pipeline (pipeline/event_pipeline/http.py).
export const USER_AGENT = "EventSelector/0.1 (agregador personal d'esdeveniments)";

type Group = { agents: string[]; rules: { allow: boolean; path: string }[] };

function parse(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (key === "allow" || key === "disallow") && value) {
        current.rules.push({ allow: key === "allow", path: value });
      }
    }
  }
  return groups;
}

function matches(rule: string, path: string): boolean {
  const anchored = rule.endsWith("$");
  const pattern = rule.replace(/\$$/, "").split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

/** true si el robots.txt permet llegir `url` (també si no n'hi ha). */
export function robotsAllows(robotsTxt: string, url: string): boolean {
  const groups = parse(robotsTxt);
  const ours = groups.filter((g) => g.agents.some((a) => a !== "*" && USER_AGENT.toLowerCase().includes(a)));
  const applicable = ours.length ? ours : groups.filter((g) => g.agents.includes("*"));
  const { pathname, search } = new URL(url);
  const path = pathname + search;
  // La regla més llarga que coincideix mana; en cas d'empat, Allow.
  let best: { allow: boolean; path: string } | null = null;
  for (const rule of applicable.flatMap((g) => g.rules)) {
    if (!matches(rule.path, path)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}
