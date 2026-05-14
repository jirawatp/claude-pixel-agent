// Office zones — where each agent goes based on what they're doing.
//
// Top rooms (activity-based, anyone visits):
//   Library    ← Read / Grep / Glob / WebFetch / WebSearch
//   Meeting    ← Task (delegation between agents)
//   Coffee     ← Stop (taking a break after a session ends)
//
// Bottom wings (role-based home desks):
//   Strategy   ← PM, SM, SA, EA, BA, Writer, Storyteller
//   Engineering← Architect, BE, FE, Full-stack, DBA, QA
//   Design     ← UX, UI, Design lead
//   Ops        ← DevOps, Security, Performance

import { zoneForRoleName } from "../state/roles.js";

export const ZONES = {
  // ── Top activity rooms ──
  library: {
    name: "Library",
    bounds: { x: 1, y: 3, w: 7, h: 4 },
    anchors: [ { x: 3, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 4 } ],
    label:   { x: 4, y: 1, text: "LIBRARY" }
  },
  meeting: {
    name: "Meeting Room",
    bounds: { x: 9, y: 3, w: 6, h: 4 },
    anchors: [ { x: 11, y: 5 }, { x: 13, y: 5 }, { x: 12, y: 4 } ],
    label:   { x: 12, y: 1, text: "MEETING" }
  },
  coffee: {
    name: "Coffee Room",
    bounds: { x: 16, y: 3, w: 7, h: 4 },
    anchors: [ { x: 18, y: 5 }, { x: 20, y: 5 }, { x: 19, y: 4 } ],
    label:   { x: 19, y: 1, text: "COFFEE" }
  },

  // ── Bottom role-based home wings ──
  strategy: {
    name: "Strategy Bay",
    bounds: { x: 1, y: 8, w: 5, h: 7 },
    deskSpots: [
      { x: 2, y: 10 }, { x: 4, y: 10 },
      { x: 2, y: 13 }, { x: 4, y: 13 }
    ],
    label: { x: 3, y: 8, text: "STRATEGY" }
  },
  engineering: {
    name: "Engineering",
    bounds: { x: 6, y: 8, w: 9, h: 7 },
    deskSpots: [
      { x: 7, y: 10 }, { x: 9, y: 10 }, { x: 11, y: 10 }, { x: 13, y: 10 },
      { x: 7, y: 13 }, { x: 9, y: 13 }, { x: 11, y: 13 }, { x: 13, y: 13 }
    ],
    label: { x: 10, y: 8, text: "ENGINEERING" }
  },
  design: {
    name: "Design Studio",
    bounds: { x: 15, y: 8, w: 5, h: 7 },
    deskSpots: [
      { x: 16, y: 10 }, { x: 18, y: 10 },
      { x: 16, y: 13 }, { x: 18, y: 13 }
    ],
    label: { x: 17, y: 8, text: "DESIGN" }
  },
  ops: {
    name: "Ops Bay",
    bounds: { x: 20, y: 8, w: 3, h: 7 },
    deskSpots: [
      { x: 21, y: 11 }, { x: 21, y: 13 }
    ],
    label: { x: 21, y: 8, text: "OPS" }
  }
};

// Tool → zone for transient visits.
const TOOL_TO_ZONE = {
  Read:      "library",
  Grep:      "library",
  Glob:      "library",
  WebSearch: "library",
  WebFetch:  "library",
  Task:      "meeting"
};

export function zoneForTool(toolName) {
  return TOOL_TO_ZONE[toolName] ?? null;
}

/** Use the roles module to map an agent's first name to its home zone. */
export function zoneForRole(agentName) {
  return zoneForRoleName(agentName);
}

/**
 * Pick (and remember) a free desk in a zone. Returns { x, y, deskKey? }.
 * Anchor-only zones return a random anchor (no desk reservation).
 */
export function pickSpotInZone(zoneKey, used) {
  const zone = ZONES[zoneKey];
  if (!zone) return { x: 12, y: 11 };
  if (zone.deskSpots) {
    for (const spot of zone.deskSpots) {
      const k = `${spot.x},${spot.y}`;
      if (!used.has(k)) { used.add(k); return { ...spot, deskKey: k }; }
    }
    // All desks taken — pick a random one (multiple agents may share visually)
    const s = zone.deskSpots[Math.floor(Math.random() * zone.deskSpots.length)];
    return { ...s };
  }
  const anchors = zone.anchors ?? [{ x: zone.bounds.x + 2, y: zone.bounds.y + 1 }];
  return { ...anchors[Math.floor(Math.random() * anchors.length)] };
}

export function jitter(spot, range = 1.2) {
  return {
    x: spot.x + (Math.random() - 0.5) * range,
    y: spot.y + (Math.random() - 0.5) * range * 0.6
  };
}

/**
 * Which zone is an agent currently in, based on tile coords?
 * Returns the zone key (e.g. "library", "engineering") or null.
 */
export function agentZone(agent) {
  if (!agent) return null;
  const x = agent.x, y = agent.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  for (const [key, z] of Object.entries(ZONES)) {
    const b = z.bounds;
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return key;
  }
  return null;
}

/** Rug color for each zone — used by the mini-map. */
export const ZONE_COLOR = {
  library:     "#a87b4f",
  meeting:     "#4d7fc6",
  coffee:      "#d97b3a",
  strategy:    "#3f7a3f",
  engineering: "#3a627a",
  design:      "#7a3a5b",
  ops:         "#3a5a52"
};
