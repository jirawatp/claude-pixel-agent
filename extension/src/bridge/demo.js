// Demo event stream — simulates many concurrent Claude Code sessions
// in the style of the Tasks UI (e.g. "Atlas+Fae Story 2.3 AuditTrailDrawer").
//
// Each agent runs an independent timeline of tool calls so the office feels
// busy without requiring the bridge to be running.

import { EVENT_TYPES } from "./events.js";

let timers = [];
let running = false;

// Each agent has a session id, a working dir (used as fallback name),
// an opening user prompt (becomes the display title), and a tool loop.
const AGENTS = [
  {
    id: "demo-atlas-fae-2-3",
    cwd: "/repo/audit-trail",
    prompt: "Atlas+Fae Story 2.3 AuditTrailDrawer",
    tools: [
      { name: "Read",      input: { file_path: "/repo/audit-trail/Drawer.tsx" } },
      { name: "Grep",      input: { pattern: "useAudit" } },
      { name: "Edit",      input: { file_path: "/repo/audit-trail/Drawer.tsx" } },
      { name: "Bash",      input: { command: "npm test -- AuditTrailDrawer" } },
      { name: "Bash",      input: { command: "npm run lint" } },
      { name: "Edit",      input: { file_path: "/repo/audit-trail/Drawer.test.tsx" } }
    ]
  },
  {
    id: "demo-iris-14b1",
    cwd: "/repo/audit-log",
    prompt: "Iris Story 14b.1 Audit Log Search",
    tools: [
      { name: "Read",      input: { file_path: "/repo/audit-log/search.ts" } },
      { name: "Grep",      input: { pattern: "searchAuditLog" } },
      { name: "Edit",      input: { file_path: "/repo/audit-log/search.ts" } },
      { name: "Bash",      input: { command: "go test ./..." } },
      { name: "Bash",      input: { command: "go vet ./..." } }
    ]
  },
  {
    id: "demo-fae-2-5",
    cwd: "/repo/grid-nav",
    prompt: "Fae Story 2.5 Grid Keyboard Nav",
    tools: [
      { name: "Read",      input: { file_path: "/repo/grid-nav/Grid.tsx" } },
      { name: "Edit",      input: { file_path: "/repo/grid-nav/Grid.tsx" } },
      { name: "Bash",      input: { command: "npm run test:e2e" } },
      { name: "Read",      input: { file_path: "/repo/grid-nav/Grid.stories.tsx" } }
    ]
  },
  {
    id: "demo-fae-sally-3a10",
    cwd: "/repo/sanction-banner",
    prompt: "Fae+Sally Story 3a.10 SanctionBanner",
    tools: [
      { name: "Read",      input: { file_path: "/repo/sanction-banner/Banner.tsx" } },
      { name: "Grep",      input: { pattern: "sanctionFlag" } },
      { name: "Read",      input: { file_path: "/repo/sanction-banner/Banner.stories.tsx" } },
      { name: "Edit",      input: { file_path: "/repo/sanction-banner/Banner.tsx" } },
      { name: "Bash",      input: { command: "npm test Banner" } }
    ]
  },
  {
    id: "demo-dax-amelia-15-1",
    cwd: "/repo/migration",
    prompt: "Dax+Amelia Story 15.1 Pre-Flight Migration",
    tools: [
      { name: "Bash",      input: { command: "migrate -dry-run" } },
      { name: "Read",      input: { file_path: "/repo/migration/plan.md" } },
      { name: "Bash",      input: { command: "psql -f preflight.sql" } }
    ]
  },
  {
    id: "demo-dax-john-15-18",
    cwd: "/repo/comms",
    prompt: "Dax+John Story 15.18 Stakeholder Comms",
    tools: [
      { name: "WebSearch", input: { query: "migration rollout announcement template" } },
      { name: "Write",     input: { file_path: "/repo/comms/announcement.md" } },
      { name: "Bash",      input: { command: "git diff --stat" } }
    ]
  },
  {
    id: "demo-atlas-16-1",
    cwd: "/repo/postman",
    prompt: "Atlas Story 16.1 Postman Collection",
    tools: [
      { name: "Read",      input: { file_path: "/repo/postman/collection.json" } },
      { name: "Edit",      input: { file_path: "/repo/postman/collection.json" } },
      { name: "Bash",      input: { command: "newman run collection.json" } }
    ]
  },
  {
    id: "demo-amelia-0-32",
    cwd: "/repo/followup",
    prompt: "Amelia Story 0.32-followup",
    tools: [
      { name: "Read",      input: { file_path: "/repo/followup/CHANGES.md" } },
      { name: "Read",      input: { file_path: "/repo/followup/index.ts" } }
    ]
  }
];

// Per-agent timeline (in ms, additive). Each agent staggers tools 1.5-3.5s apart.
function* timeline(agent) {
  // Realistic offset so they don't all start at the exact same instant.
  const startOffset = Math.floor(Math.random() * 2000);
  yield { d: startOffset,
          ev: { type: EVENT_TYPES.SESSION_START, sessionId: agent.id, cwd: agent.cwd } };
  yield { d: 200 + Math.random() * 300,
          ev: { type: EVENT_TYPES.USER_PROMPT, sessionId: agent.id, prompt: agent.prompt } };
  yield { d: 600 + Math.random() * 600,
          ev: { type: EVENT_TYPES.THINKING, sessionId: agent.id, text: "Planning approach…" } };
  for (let i = 0; i < agent.tools.length; i++) {
    const t = agent.tools[i];
    yield { d: 1200 + Math.random() * 2400,
            ev: { type: EVENT_TYPES.PRE_TOOL_USE, sessionId: agent.id, tool_name: t.name, tool_input: t.input } };
    yield { d: 800 + Math.random() * 1500,
            ev: { type: EVENT_TYPES.POST_TOOL_USE, sessionId: agent.id, tool_name: t.name, success: true } };
  }
  yield { d: 600 + Math.random() * 400,
          ev: { type: EVENT_TYPES.ASSISTANT_MSG, sessionId: agent.id, text: "Done — ready for review." } };
  yield { d: 800 + Math.random() * 800,
          ev: { type: EVENT_TYPES.STOP, sessionId: agent.id } };
}

export function runDemo(emit) {
  if (running) return;
  running = true;
  for (const agent of AGENTS) {
    let acc = 0;
    for (const step of timeline(agent)) {
      acc += step.d;
      const t = setTimeout(() => emit({ ...step.ev, ts: Date.now() }), acc);
      timers.push(t);
    }
  }
  // Clear running flag a bit after the longest possible timeline.
  timers.push(setTimeout(() => { running = false; }, 60_000));
}

export function stopDemo() {
  for (const t of timers) clearTimeout(t);
  timers = [];
  running = false;
}
