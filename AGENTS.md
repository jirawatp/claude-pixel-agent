# AGENTS.md

Guide for AI assistants (and humans) working on **Claude Pixel Agent** —
a Chrome extension that visualizes live Claude Code sessions as pixel-art
characters in a customizable, zone-based office.

This file serves two purposes:

1. Onboarding for anyone editing the codebase: conventions, layout, commands.
2. Reference for the **agent role catalog** the visualizer recognizes
   (PM, SM, SA, EA, UI/UX, BE, FE, QA, …) — so you know how to add a new agent
   or rewire role-to-zone routing.

---

## Quick start

```bash
# Bridge (Node WS server + Claude Code hook receiver)
npm install     # installs the bridge workspace
npm start       # → http://127.0.0.1:9876

# Extension
# 1. chrome://extensions → Developer mode → Load unpacked → select extension/
# 2. Click the extension icon → side panel opens; ⤢ button opens full dashboard

# Hooks
# In the dashboard Connection tab, click "Install hooks automatically"
# (writes to ~/.claude/settings.json with a timestamped backup; idempotent)
```

Replay a past session as real data (no live Claude Code required):

```bash
npm run replay -- --duration 30
# or point at a specific session:
npm run replay -- --duration 30 \
  --dir ~/.claude/projects/<project-slug>/<session-uuid>/subagents
```

Other npm scripts at the root:

| Script               | Effect                                                  |
| -------------------- | ------------------------------------------------------- |
| `npm start`          | Start the bridge (workspace `bridge`)                   |
| `npm run dev`        | Start the bridge with `--watch`                         |
| `npm run replay`     | Stream a past session through the bridge                |
| `npm run icons`      | Regenerate the extension PNG icons (zero deps)          |
| `npm run check`      | `node --check` every JS file in the repo                |
| `npm run serve:dev`  | Serve `extension/` over http://127.0.0.1:8123 for browser-based testing |
| `npm run clean`      | Remove all `node_modules`                               |

---

## Repo layout

```
extension/
├── manifest.json           Manifest V3 (sidePanel + tabs + localhost host perms)
├── background/             Service worker — owns the WebSocket to the bridge
├── sidepanel/              Compact always-visible view
├── dashboard/              Full dashboard (Office / Avatars / Layout / Connection)
├── options/                Options page
├── src/
│   ├── renderer/           Pixel-art canvas engine
│   │   ├── sprite-factory.js   Procedural 16×24 characters
│   │   ├── tilemap.js          Terrain + furniture sprites + defaultMap
│   │   ├── speech-bubble.js    Speech / thought / name+role tags
│   │   ├── character.js        Per-agent entity + state line
│   │   ├── canvas-renderer.js  Main render loop + zone labels
│   │   └── zones.js            Office zones + tool→zone + spot picker
│   ├── customization/
│   │   ├── avatar-editor.js    Skin / hair / outfit / accessory + preview
│   │   └── office-editor.js    Click-to-place furniture + terrain
│   ├── bridge/
│   │   ├── client.js           WS client + event handler + zone routing
│   │   ├── events.js           Event type constants + verb mapping
│   │   └── demo.js             Multi-agent demo stream
│   └── state/
│       ├── store.js            chrome.storage wrapper (mem-fallback for http://)
│       └── roles.js            Role taxonomy (PM/SM/SA/EA/UX/BE/FE/QA/…)
└── assets/                 Icons + palette
bridge/
├── server.js               HTTP/WS server + /install-hooks endpoint
├── replay.js               Stream past transcripts through the bridge
└── package.json
hooks/
├── notify.sh / notify.ps1  Hook scripts that POST to the bridge
└── example-settings.json   Manual settings.json snippet
scripts/
└── make-icons.js           Procedural PNG icon generator (zero deps)
```

---

## Architecture (data flow)

```
Claude Code session
   │   (hook fires; JSON via stdin)
   ▼
hooks/notify.sh    ─── POST /hook ───▶  bridge/server.js
                                            │ translateHook()
                                            ▼
                                       broadcast() over WebSocket
                                            │
                                            ▼
extension/background/service-worker.js  ── chrome.runtime port ──▶  UI
                                                                    │
                                                                    ▼
                                                          BridgeClient.handleEvent
                                                          ├─ update character state
                                                          ├─ assign home desk by role
                                                          ├─ route to zone by tool
                                                          └─ post speech / thought bubble
```

When run outside the extension runtime (`http://localhost:8123/dashboard/...`),
`BridgeClient` falls back to opening the WebSocket directly to
`ws://127.0.0.1:9876/ws`. That makes browser-based testing possible.

---

## Code conventions

- **Vanilla ES modules**, no TypeScript, no bundler. `<script type="module">`
  in HTML; `import`/`export` in JS.
- 2-space indent; semicolons; double quotes.
- Pixel art is **procedural** — each character is drawn from string templates
  in `sprite-factory.js`, each furniture piece from a `draw*` function in
  `tilemap.js`. No PNG sprite sheets.
- Canvas drawing always uses integer pixel coords; the renderer sets
  `imageSmoothingEnabled = false` at init.
- State is persisted via `chrome.storage.local` through a thin wrapper
  (`state/store.js`) that falls back to an in-memory shim when `chrome` is
  unavailable, so dashboard pages can be opened directly via `http://` for
  testing.
- New files: prefer adding to an existing module if it fits naturally; only
  create a new file when the surface area justifies it.
- Comments only when the *why* is non-obvious (a constraint, a workaround,
  a subtle invariant). Identifiers should already explain *what*.

---

## Event protocol (bridge ↔ extension)

All events share `type`, `sessionId`, and `ts`. See `extension/src/bridge/events.js`.
The bridge installs **17 Claude Code hook events** and translates each via
`translateHook()` in `bridge/server.js`.

| `type`              | Source hook                                    | Effect                              |
| ------------------- | ---------------------------------------------- | ----------------------------------- |
| `session_start`     | `SessionStart`                                 | Spawn character, walk to home desk  |
| `session_end`       | `SessionEnd`                                   | Walk off-screen, remove             |
| `user_prompt`       | `UserPromptSubmit`                             | Set agent title + capture persona   |
| `pre_tool_use`      | `PreToolUse`                                   | Increment counter, route to zone    |
| `post_tool_use`     | `PostToolUse` / `PostToolUseFailure`           | Return to home desk; failure→error  |
| `subagent_start`    | `SubagentStart`                                | Spawn subagent character (BMad-style) |
| `subagent_stop`     | `SubagentStop`                                 | Walk subagent to coffee             |
| `task_created`      | `TaskCreated`                                  | Parent walks to meeting room        |
| `task_completed`    | `TaskCompleted`                                | Parent returns to home desk         |
| `stop`              | `Stop` / `StopFailure`                         | Walk to coffee (error if failure)   |
| `permission_request`| `PermissionRequest`                            | Thought bubble, amber status        |
| `permission_denied` | `PermissionDenied`                             | Error status                        |
| `pre_compact`       | `PreCompact`                                   | Walk to library, "Compacting…"      |
| `post_compact`      | `PostCompact`                                  | "Compacted ✓" thought               |
| `assistant_msg`     | `Notification`                                 | Speech bubble                       |
| `thinking`          | (synthetic — bridge emits)                     | Thought bubble                      |

### To add a new event:

1. Add the hook name to `HOOK_EVENTS` in `bridge/server.js`.
2. Add a `case` in `translateHook()` that returns `{ ...base, type: "<your_type>", ... }`.
3. Add `EVENT_TYPES.YOUR_TYPE = "<your_type>"` in `extension/src/bridge/events.js`.
4. Add a bubble mapping in `eventToBubble()`.
5. Add a handler in `BridgeClient.handleEvent()` for any movement/state effect.
6. Add a description in `HOOK_DESCRIPTIONS` (dashboard.js) so the Connection panel shows it.

---

## Office zones (where agents go)

Top of the office (rows 2–7) — **activity rooms**, anyone visits:

| Zone        | Triggered by                              | Visual cues                                 |
| ----------- | ----------------------------------------- | ------------------------------------------- |
| **Library** | `Read` / `Grep` / `Glob` / `WebSearch` / `WebFetch` | Brown rug, 4 bookshelves, reading lamp |
| **Meeting** | `Task` (sub-agent delegation)             | Blue carpet, 2 round meeting tables + chairs |
| **Coffee**  | `Stop` (session ends — taking a break)    | Orange rug, coffee machine, water cooler, sofas |

Bottom of the office (rows 8–15) — **role-based home wings**:

| Wing            | Roles homed here                                       | Furniture                          |
| --------------- | ------------------------------------------------------ | ---------------------------------- |
| **Strategy**    | PM, SM, SA, EA, BA, Writer, Storyteller                | 4 desks + kanban whiteboard        |
| **Engineering** | Architect, BE, FE, Full-stack, DBA, QA                 | 8 desks in two rows                |
| **Design**      | UX, UI, Design Lead                                    | 4 desks with **double monitors**   |
| **Ops**         | DevOps, Security, Performance                          | Server racks + 2 desks             |

Zone definitions: `extension/src/renderer/zones.js`.
Tool→zone routing: `TOOL_TO_ZONE` constant in the same file.

---

## Agent role catalog

Source of truth: [`extension/src/state/roles.js`](extension/src/state/roles.js).

The agent's display name is parsed for the **first identifier** (letters only)
and matched against `NAME_TO_ROLE`. Compound names like `Atlas+Fae Story 2.3`
match against the first name (`atlas` → ARCH). Unmatched names default to
the `engineering` zone with no role badge.

| First name | Role key      | Label  | Full title              | Color    | Home zone   |
| ---------- | ------------- | ------ | ----------------------- | -------- | ----------- |
| john       | `pm`          | PM     | Product Manager         | `#5cb85c` | strategy    |
| bob        | `sm`          | SM     | Scrum Master            | `#7ccf7c` | strategy    |
| mary       | `analyst`     | BA     | Business Analyst        | `#9b59b6` | strategy    |
| saga       | `analyst`     | BA     | Business Analyst        | `#9b59b6` | strategy    |
| winston    | `sa`          | SA     | Solutions Architect     | `#6acef0` | strategy    |
| atlas      | `arch`        | ARCH   | Software Architect      | `#a48cff` | engineering |
| sally      | `ux`          | UX     | UX Designer             | `#e91e63` | design      |
| freya      | `ux`          | UX     | UX Designer             | `#e91e63` | design      |
| maya       | `ux`          | UX     | UX Designer             | `#e91e63` | design      |
| fae        | `fe`          | FE     | Frontend Engineer       | `#f0a830` | engineering |
| lin        | `fe`          | FE     | Frontend Engineer (LIFF)| `#f0a830` | engineering |
| amelia     | `be`          | BE     | Backend Engineer        | `#3a8fd6` | engineering |
| barry      | `fullstack`   | FS     | Full-Stack Engineer     | `#5cb85c` | engineering |
| dax        | `dba`         | DBA    | Database Engineer       | `#16a085` | engineering |
| iris       | `qa`          | QA     | Quality Engineer        | `#f0a830` | engineering |
| mira       | `qa`          | QA     | Quality Engineer        | `#f0a830` | engineering |
| vera       | `qa`          | QA     | Quality Engineer        | `#f0a830` | engineering |
| quinn      | `qa`          | QA     | Quality Engineer        | `#f0a830` | engineering |
| murat      | `qa`          | QA     | Quality Engineer (TEA)  | `#f0a830` | engineering |
| sec        | `sec`         | SEC    | Security Engineer       | `#d44c4c` | ops         |
| perry      | `perf`        | PERF   | Performance Engineer    | `#e67e22` | ops         |
| devon      | `devops`      | OPS    | DevOps / Platform       | `#16a085` | ops         |
| paige      | `writer`      | WR     | Tech Writer             | `#9aa0c7` | strategy    |
| sophia     | `storyteller` | ST     | Storyteller             | `#9aa0c7` | strategy    |
| pm / sm / ux / ui / ba | (generic alias) | — | (matches the role label directly) | — | — |

Add a new role:

```js
// In extension/src/state/roles.js
ROLES.pde = { label: "PDE", full: "Platform Dev Engineer", color: "#22c55e", zone: "ops" };
NAME_TO_ROLE.morgan = "pde";
```

Add a new name to an existing role: append to `NAME_TO_ROLE`.

Add a new zone: add it to `ZONES` in
[`extension/src/renderer/zones.js`](extension/src/renderer/zones.js)
(with `deskSpots` for home zones, `anchors` for visit zones, and a `label` for
the canvas overlay), then point one or more roles at it via `ZONES` in roles.js.

---

## Agent inspection (persona + skills)

Clicking any row in the side panel expands it inline to show:

- **Role** badge + full title
- **Cwd** — working directory captured at session start
- **Status** — `Running <tool> · <elapsed> · <N> tool uses`
- **Persona / current brief** — captured from the first user prompt
  (truncated to 400 chars). For BMad-style "You are Atlas (BE) + Fae (FE)…"
  prompts, this is the full role + task description.
- **Skills used** — top 8 tools by call count, drawn as proportional bars.
- **Customize avatar** — jumps to the Avatar tab pre-selected.

The expanded state is tracked in a module-level `Set` so it survives the
1-second auto-refresh of the agent list.

---

## Hook install endpoints (bridge)

Three endpoints, all idempotent and backup-first:

| Method | Path                | Effect                                              |
| ------ | ------------------- | --------------------------------------------------- |
| GET    | `/hook-status`      | Per-event installed/not-installed map               |
| POST   | `/install-hooks`    | Add notify.sh to UserPromptSubmit/PreToolUse/PostToolUse/Stop/SessionEnd |
| POST   | `/uninstall-hooks`  | Remove only our entries; preserve every other hook  |

Settings.json is backed up to `~/.claude/settings.json.bak.<timestamp>` before
any write. Install detects existing entries with the same command and skips
them, so calling install repeatedly is safe.

---

## Common edit recipes

### "An agent's name isn't getting the right role badge"

The first identifier is being mismatched. Check
[`extension/src/state/roles.js`](extension/src/state/roles.js) `NAME_TO_ROLE`
and add the lowercase first name.

### "Add a new tool routing rule"

Edit `TOOL_TO_ZONE` in
[`extension/src/renderer/zones.js`](extension/src/renderer/zones.js).

```js
const TOOL_TO_ZONE = {
  Read: "library", Grep: "library", Glob: "library",
  WebSearch: "library", WebFetch: "library",
  Task: "meeting",
  // Add yours:
  NotebookEdit: "library"
};
```

### "Add a new furniture type"

1. In [`tilemap.js`](extension/src/renderer/tilemap.js) add a `drawFooBar` function.
2. Add `"foo_bar"` to the `FURNITURE_TYPES` export array.
3. Add it to the switch in `drawFurniture`.
4. Place instances in `defaultMap()` or via the in-app Layout editor.

### "Change the default office layout"

Edit `defaultMap()` in `tilemap.js`. Existing user storage will keep their
custom layout; only fresh installs (or `Reset to default` in the Layout tab)
pick up changes.

### "Change the bridge port"

`PIXEL_AGENT_PORT=12345 node bridge/server.js`, then set the same WS URL in
the dashboard's Connection tab. The extension's host permissions cover any
localhost port.

---

## Testing checklist before a PR

- `node --check` every JS file you touched.
- `cd bridge && npm start` then `curl http://127.0.0.1:9876/health` — should
  return `{"ok":true,"clients":N}`.
- `node bridge/replay.js --duration 25` — every previously-saved session
  surfaces; agent names look right; role badges look right; no console errors.
- Open `chrome://extensions/`, reload the extension, click the icon —
  side panel should open, status dot should turn green within ~2 s.
- For UI-touching changes: load the dashboard, run the demo, click an agent
  row to confirm the detail panel still expands.

---

## Privacy

Everything runs on `127.0.0.1`. The bridge has no upstream; the extension's
only host permissions are `localhost` / `127.0.0.1`. Hook payloads stay on
your machine. The dashboard never makes outbound requests.

---

## Adding a brand-new agent persona end-to-end

Concrete example — adding `Hugo` as a Site Reliability Engineer.

1. **Role + name mapping** — in `extension/src/state/roles.js`:
   ```js
   ROLES.sre = { label: "SRE", full: "Site Reliability Engineer",
                 color: "#0ea5e9", zone: "ops" };
   NAME_TO_ROLE.hugo = "sre";
   ```
2. **(Optional) New zone** — if SRE deserves its own corner, add it under
   `ZONES` in `extension/src/renderer/zones.js` with `deskSpots` and a `label`,
   then point `ROLES.sre.zone` at the new key.
3. **Reload** — restart the bridge or refresh the dashboard. Any session
   starting with "Hugo …" in the first user prompt will now spawn with the
   SRE badge in the right wing.

That's it — no changes needed to the renderer, the bridge, or the hooks.
