// Persona/title derivation from BMad-style "You are X" prompts.
// Pure functions — runs in both browser (extension) and Node (replay script).
//
// Example inputs and the names we extract:
//   "You are Atlas (BE) + Fae (FE). Story 2.3 …"
//     → "Atlas+Fae Story 2.3 …"  if a story file is referenced
//     → "Atlas+Fae Story 2.3"    otherwise
//
//   "You are Iris (Staff SWE). TDD mandatory. … stories/14b-1-audit-log-search.md …"
//     → "Iris Story 14b.1 AuditLogSearch"
//
//   "You are Sec + Iris. …"
//     → "Sec+Iris"

export function deriveTitle(prompt) {
  if (!prompt) return null;
  const txt = String(prompt);

  // "Story X.Y" or "Story X.Y-followup"
  const storyMatch = txt.match(/Story\s+([0-9a-z\.\-]+(?:-followup)?)/i);

  // "You are Name (role) + Name (role) + …"
  const agentsMatch = txt.match(
    /You are\s+([A-Z][a-zA-Z]+(?:\s*\([^)]*\))?(?:\s*\+\s*[A-Z][a-zA-Z]+(?:\s*\([^)]*\))?)*)/
  );

  // Component name from story file path: "stories/2-3-audittraildrawer-…md"
  const componentMatch = txt.match(/stories\/[\d\.\-]+-([a-z][a-z0-9\-]+?)(?:[\.\-]|\b)/i);

  const cleanAgents = (agentsMatch?.[1] ?? "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, "")
    .replace(/\++$/, "");
  const componentTitle = componentMatch ? toTitleCase(componentMatch[1]) : "";

  if (cleanAgents && storyMatch && componentTitle) {
    return `${cleanAgents} Story ${storyMatch[1]} ${componentTitle}`;
  }
  if (cleanAgents && storyMatch) {
    return `${cleanAgents} Story ${storyMatch[1]}`;
  }
  if (storyMatch && componentTitle) {
    return `Story ${storyMatch[1]} ${componentTitle}`;
  }
  if (cleanAgents) return cleanAgents;
  if (storyMatch) return `Story ${storyMatch[1]}`;

  // Last resort: first 60 chars of the prompt, normalized.
  return txt.replace(/\s+/g, " ").slice(0, 60).trim();
}

function toTitleCase(slug) {
  return slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

/**
 * Extract a 1-line persona summary from a prompt.
 * Tries to keep the "You are X" sentence + maybe one more.
 */
export function extractPersonaSummary(prompt, maxLen = 280) {
  if (!prompt) return "";
  const text = String(prompt).trim();
  // Grab the first 1-2 sentences
  const sentences = text.split(/(?<=[.!?])\s+/);
  let summary = sentences[0] ?? text;
  if (summary.length < 80 && sentences[1]) summary += " " + sentences[1];
  return summary.length > maxLen ? summary.slice(0, maxLen - 1) + "…" : summary;
}
