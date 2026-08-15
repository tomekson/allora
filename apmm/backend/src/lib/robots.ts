/**
 * Minimalistické vyhodnocení robots.txt: pravidla pro daného user-agenta
 * (prefix match, case-insensitive), jinak pro `*`. Vyhrává nejdelší
 * matchující pravidlo; při shodě délky Allow před Disallow.
 */
export function isPathAllowed(robotsTxt: string, path: string, userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  type Rule = { allow: boolean; prefix: string };
  const groups = new Map<string, Rule[]>();

  let currentAgents: string[] = [];
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === "user-agent") {
      if (!lastWasAgent) currentAgents = [];
      currentAgents.push(value.toLowerCase());
      lastWasAgent = true;
      for (const agent of currentAgents) {
        if (!groups.has(agent)) groups.set(agent, []);
      }
    } else if (field === "allow" || field === "disallow") {
      lastWasAgent = false;
      if (value === "" && field === "disallow") continue; // prázdný Disallow = povoleno vše
      for (const agent of currentAgents) {
        groups.get(agent)?.push({ allow: field === "allow", prefix: value });
      }
    } else {
      lastWasAgent = false;
    }
  }

  const agentKey = [...groups.keys()].find((k) => k !== "*" && ua.includes(k));
  const rules = (agentKey ? groups.get(agentKey) : undefined) ?? groups.get("*") ?? [];

  let best: { allow: boolean; length: number } | undefined;
  for (const rule of rules) {
    if (!path.startsWith(rule.prefix)) continue;
    if (
      !best ||
      rule.prefix.length > best.length ||
      (rule.prefix.length === best.length && rule.allow && !best.allow)
    ) {
      best = { allow: rule.allow, length: rule.prefix.length };
    }
  }
  return best?.allow ?? true;
}
