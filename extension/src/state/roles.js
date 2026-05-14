// Role taxonomy — maps the first name in an agent title to a role,
// and each role to a label, color, and home zone.
//
// Covers BMAD-style agents (Atlas, Fae, Iris, Dax, etc.) plus the classic
// product roles (PM, SM, SA, EA, UI/UX) the user called out.

export const ROLES = {
  // ── Product / Strategy ──
  pm:      { label: "PM",   full: "Product Manager",      color: "#5cb85c", zone: "strategy" },
  sm:      { label: "SM",   full: "Scrum Master",         color: "#7ccf7c", zone: "strategy" },
  sa:      { label: "SA",   full: "Solutions Architect",  color: "#6acef0", zone: "strategy" },
  ea:      { label: "EA",   full: "Enterprise Architect", color: "#a48cff", zone: "strategy" },
  analyst: { label: "BA",   full: "Business Analyst",     color: "#9b59b6", zone: "strategy" },
  writer:  { label: "WR",   full: "Tech Writer",          color: "#9aa0c7", zone: "strategy" },
  storyteller: { label: "ST", full: "Storyteller",         color: "#9aa0c7", zone: "strategy" },

  // ── Design ──
  ux:      { label: "UX",   full: "UX Designer",          color: "#e91e63", zone: "design" },
  ui:      { label: "UI",   full: "UI Designer",          color: "#ff7eb9", zone: "design" },
  design:  { label: "DSGN", full: "Design Lead",          color: "#e91e63", zone: "design" },

  // ── Engineering ──
  arch:    { label: "ARCH", full: "Software Architect",   color: "#a48cff", zone: "engineering" },
  be:      { label: "BE",   full: "Backend Engineer",     color: "#3a8fd6", zone: "engineering" },
  fe:      { label: "FE",   full: "Frontend Engineer",    color: "#f0a830", zone: "engineering" },
  fullstack:{label:"FS",    full: "Full-Stack Engineer",  color: "#5cb85c", zone: "engineering" },
  dba:     { label: "DBA",  full: "Database Engineer",    color: "#16a085", zone: "engineering" },
  qa:      { label: "QA",   full: "Quality Engineer",     color: "#f0a830", zone: "engineering" },

  // ── Ops / Cross-cutting ──
  sec:     { label: "SEC",  full: "Security Engineer",    color: "#d44c4c", zone: "ops" },
  perf:    { label: "PERF", full: "Performance Engineer", color: "#e67e22", zone: "ops" },
  devops:  { label: "OPS",  full: "DevOps / Platform",    color: "#16a085", zone: "ops" }
};

// First-name → role key.
const NAME_TO_ROLE = {
  // PM / SM
  john:    "pm",
  bob:     "sm",
  mary:    "analyst",
  saga:    "analyst",
  // SA / EA / Architect
  winston: "sa",
  atlas:   "arch",
  // UI / UX
  sally:   "ux",
  freya:   "ux",
  maya:    "ux",
  // Frontend / Mobile UI
  fae:     "fe",
  lin:     "fe",
  // Backend / Full-stack
  amelia:  "be",
  barry:   "fullstack",
  // DBA
  dax:     "dba",
  // QA
  iris:    "qa",
  mira:    "qa",
  vera:    "qa",
  quinn:   "qa",
  murat:   "qa",
  // Security
  sec:     "sec",
  // Performance
  perry:   "perf",
  // DevOps
  devon:   "devops",
  // Writer / Storyteller
  paige:   "writer",
  sophia:  "storyteller",
  // Generic
  pm:      "pm",
  sm:      "sm",
  ux:      "ux",
  ui:      "ui",
  ba:      "analyst"
};

/**
 * Extract the first identifier from an agent title and return its role.
 * "Atlas+Fae Story 2.3 …" → arch
 * "John Story 1.2 Roadmap" → pm
 * Returns null if unrecognized.
 */
export function roleForName(name) {
  if (!name) return null;
  const first = String(name).match(/[A-Za-z]+/)?.[0]?.toLowerCase() ?? "";
  const key = NAME_TO_ROLE[first];
  if (!key) return null;
  return { key, ...ROLES[key] };
}

/** Pretty role label used under the avatar — e.g. "BE" or "PM". */
export function roleLabel(name) {
  return roleForName(name)?.label ?? "";
}

/** Color of the role badge. Falls back to a neutral grey. */
export function roleColor(name) {
  return roleForName(name)?.color ?? "#9aa0c7";
}

/** Home zone key for the agent, used by zones.js to assign a desk. */
export function zoneForRoleName(name) {
  return roleForName(name)?.zone ?? "engineering";
}
