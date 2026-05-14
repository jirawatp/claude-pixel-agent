# Claude Pixel Agent

A Chrome extension that visualizes your live Claude Code sessions as
pixel-art characters in a customizable office. Inspired by
[Claw-Empire](https://github.com/GreenSheep01201/claw-empire) and the
Gather.town aesthetic.

```
   ┌──────────────────────────────────────────┐
   │   [Whiteboard]                           │
   │                                          │
   │   [💻] Alice    [💻] Bob     [💻] Carol  │
   │   "Reading"    "Bash: go    "Browsing"   │
   │                 test ./..."              │
   │                                          │
   │   ┌─────┐ ┌─────┐                        │
   │   │sofa │ │sofa │  🪴  ☕                │
   │   └─────┘ └─────┘                        │
   └──────────────────────────────────────────┘
```

## What you get

- **Live agent characters** — one pixel character per Claude Code session.
- **Zone-based routing** — agents walk to the room that matches what they're
  doing:
  - `Read` / `Grep` / `Glob` / `WebSearch` / `WebFetch` → **Library**
  - `Task` (delegation) → **Meeting Room**
  - `Stop` (session ends) → **Coffee Room** (taking a break)
  - everything else → their **home desk**
- **Role-based home desks** — agent name parsed to assign a wing:
  - Atlas, Amelia, Dax, Iris, John, Vera, Mira, Quinn → **Backend wing**
  - Fae, Sally, Freya → **Frontend wing**
  - Devon, Perry, Sec → **Ops Bay** (server rack)
- **Speech & thought bubbles** — every tool call, prompt, and reply appears
  above the character's head.
- **Tasks-UI–style status** — side panel rows show
  `Agent · Running Bash · 2m 24s · 43 tool uses` with Running/Completed sections.
- **Avatar customization** — skin, hair style + color, outfit, accessory
  (glasses, headset, hat), name.
- **Office layout editor** — paint terrain (floor, wall, 3 rug variants) and
  place furniture (desks, chairs, computers, plants, whiteboards, sofas,
  bookshelves, meeting tables, coffee machines, server racks, water coolers).
- **Side panel + full dashboard** — compact always-visible view alongside any
  tab, plus a full-screen dashboard for customization.
- **Works with Claude Code in any flavor** — CLI, Desktop app, or IDE
  extension. The bridge listens for hook events from all of them.

## Architecture

```
┌─────────────────────┐   hook fires      ┌────────────────────┐
│ Claude Code         │ ─── stdin JSON ──>│ hooks/notify.sh    │
│ (CLI / Desktop /    │                   │ → curl POST        │
│  IDE extension)     │                   └────────┬───────────┘
└─────────────────────┘                            ↓
                                          ┌────────────────────┐
                                          │ bridge/server.js   │
                                          │ HTTP /hook + WS /ws│
                                          │ (Node, port 9876)  │
                                          └────────┬───────────┘
                                                   ↓  ws://...
                                          ┌────────────────────┐
                                          │ Chrome extension   │
                                          │ • side panel       │
                                          │ • dashboard tab    │
                                          │ • canvas renderer  │
                                          └────────────────────┘
```

## Setup

### 1. Start the bridge

```bash
npm install     # installs the bridge workspace (one-time)
npm start       # → listening on http://127.0.0.1:9876
```

Open <http://127.0.0.1:9876/> to confirm it's running.

Other root scripts: `npm run replay` (stream a real session through the
bridge), `npm run icons` (regenerate PNG icons), `npm run check`
(syntax-check every JS file), `npm run serve:dev` (serve `extension/` over
http for dashboard-only browser testing).

### 2. Load the extension

1. Open `chrome://extensions/`
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** and select the `extension/` folder.
4. Pin the extension. Click its icon → the side panel opens; click the
   ⤢ button to open the full dashboard.

You should see the office. Click **Connection → Run demo session** to see
agents move and talk without wiring up hooks.

### 3. Wire up Claude Code hooks

Open `~/.claude/settings.json` (create it if missing) and merge in the `hooks`
block from [`hooks/example-settings.json`](./hooks/example-settings.json),
replacing the path with where you cloned this repo:

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": ".*",
      "hooks": [{ "type": "command", "command": "/abs/path/claude-pixel-agent/hooks/notify.sh" }]
    }],
    "PreToolUse":   [ /* same shape */ ],
    "PostToolUse":  [ /* same shape */ ],
    "Stop":         [ /* same shape */ ],
    "SessionEnd":   [ /* same shape */ ]
  }
}
```

Make the script executable: `chmod +x hooks/notify.sh`.

Windows: use `hooks/notify.ps1`. See [`hooks/README.md`](./hooks/README.md).

### 4. Start using Claude Code

Run any Claude Code command in your terminal, desktop app, or IDE. Within
seconds the agent appears in the office and starts speaking what it's doing.

### 5. (Optional) Replay a past session with real data

To see the dashboard render real activity without installing hooks, replay an
existing transcript through the bridge:

```bash
# Auto-pick the most recently-active project + replay its subagents
node bridge/replay.js --duration 30

# Or point at a specific subagents folder
node bridge/replay.js --duration 30 \
  --dir ~/.claude/projects/<project-slug>/<session-uuid>/subagents
```

This compresses the past activity of every subagent into 30 seconds. Agent
names are derived from the first user prompt (`Atlas+Fae Story 2.3 …`), and
durations/tool counts mirror what Claude Code's Tasks UI shows.

## Customizing

| Tab            | What it does                                                      |
| -------------- | ----------------------------------------------------------------- |
| **Office**     | Live view. Sidebar lists active agents with their current activity. |
| **Avatars**    | Pick an agent, change skin, hair, outfit, accessory, name. Save.   |
| **Layout**     | Click furniture/terrain to place. Right-click on a tile to remove. |
| **Connection** | Bridge URL, reconnect, demo controls.                              |

All customizations persist in `chrome.storage.local`.

## Repo layout

```
claude-pixel-agent/
├── extension/             ← Chrome extension (load this in chrome://extensions)
│   ├── manifest.json
│   ├── background/        ← service worker (WebSocket connection)
│   ├── sidepanel/         ← compact live view
│   ├── dashboard/         ← full office + customization
│   ├── options/           ← settings page
│   ├── src/
│   │   ├── renderer/      ← pixel art canvas engine
│   │   ├── customization/ ← avatar + layout editors
│   │   ├── bridge/        ← WS client, event mapping, demo stream
│   │   └── state/         ← chrome.storage store
│   └── assets/            ← icons + palette
├── bridge/                ← local Node WS server
│   ├── server.js
│   └── package.json
├── hooks/                 ← Claude Code hook scripts + example settings
│   ├── notify.sh
│   ├── notify.ps1
│   └── example-settings.json
├── scripts/
│   └── make-icons.js      ← regenerates the PNG icons
└── README.md
```

## Event protocol

Events sent from the bridge to the extension over WebSocket. All include
`type`, `sessionId`, and `ts`. The bridge listens for **17 Claude Code hook
events** and translates each into one of these normalized types.

### Session lifecycle

| `type`            | Hook                       | Effect                            |
| ----------------- | -------------------------- | --------------------------------- |
| `session_start`   | `SessionStart`             | Spawn character, walk to home desk |
| `session_end`     | `SessionEnd`               | Walk off-screen, remove           |
| `user_prompt`     | `UserPromptSubmit`         | Capture title + persona           |

### Tool calls

| `type`            | Hook                       | Effect                            |
| ----------------- | -------------------------- | --------------------------------- |
| `pre_tool_use`    | `PreToolUse`               | Increment counter, route to zone  |
| `post_tool_use`   | `PostToolUse` / `PostToolUseFailure` | Return to home desk; failure flips status to error |

### Subagent / Task lifecycle (BMad-style multi-agent flows)

| `type`            | Hook                       | Effect                            |
| ----------------- | -------------------------- | --------------------------------- |
| `subagent_start`  | `SubagentStart`            | New pixel character for the subagent (uses `subagent_type` as name) |
| `subagent_stop`   | `SubagentStop`             | Walk to coffee; flip to error on failure |
| `task_created`    | `TaskCreated`              | Parent agent walks to meeting room |
| `task_completed`  | `TaskCompleted`            | Parent walks back to home desk    |

### Stop / failure

| `type`            | Hook                                          | Effect                            |
| ----------------- | --------------------------------------------- | --------------------------------- |
| `stop`            | `Stop` (`failure: true` on `StopFailure`)     | Walk to coffee room               |

### Permissions

| `type`              | Hook                | Effect                            |
| ------------------- | ------------------- | --------------------------------- |
| `permission_request`| `PermissionRequest` | Thought bubble, amber status      |
| `permission_denied` | `PermissionDenied`  | Error status                      |

### Context compaction

| `type`         | Hook         | Effect                                  |
| -------------- | ------------ | --------------------------------------- |
| `pre_compact`  | `PreCompact` | "Compacting…" thought, walk to library  |
| `post_compact` | `PostCompact`| "Compacted ✓" thought                   |

### Messages

| `type`         | Hook           | Effect                                  |
| -------------- | -------------- | --------------------------------------- |
| `assistant_msg`| `Notification` | Speech bubble with the text             |
| `thinking`     | (synthetic)    | Thought bubble                          |

Hooks are wired up automatically when you click **Install hooks automatically**
in the Connection tab. Existing hooks (e.g. GitKraken) are preserved and the
settings file is backed up before any change.

## Privacy

Everything runs locally. Hook payloads → local bridge (`127.0.0.1`) → local
extension. No data leaves your machine. The extension only declares host
permissions for `127.0.0.1` and `localhost`.

## License

Apache-2.0.
