#!/usr/bin/env node
// Local bridge for Claude Pixel Agent.
//
// Listens on http://127.0.0.1:9876 for Claude Code hook callbacks and
// rebroadcasts normalized events to any connected Chrome extension over
// WebSocket at ws://127.0.0.1:9876/ws.
//
// Run:  npm install && npm start
//
// Configure Claude Code hooks to POST to /hook — see hooks/example-settings.json.

import http from "node:http";
import { WebSocketServer } from "ws";
import { readFile, writeFile, copyFile, access, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.PIXEL_AGENT_HOST || "127.0.0.1";
const PORT = Number(process.env.PIXEL_AGENT_PORT || 9876);

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const HOOK_SCRIPT_UNIX = resolve(REPO_ROOT, "hooks", "notify.sh");
const HOOK_SCRIPT_WIN  = resolve(REPO_ROOT, "hooks", "notify.ps1");
const SETTINGS_PATH    = join(homedir(), ".claude", "settings.json");
const HOOK_EVENTS = [
  // Session lifecycle
  "SessionStart", "SessionEnd",
  // User input
  "UserPromptSubmit",
  // Tool calls (and failures)
  "PreToolUse", "PostToolUse", "PostToolUseFailure",
  // Subagent / Task lifecycle (BMad-style multi-agent flows)
  "SubagentStart", "SubagentStop",
  "TaskCreated", "TaskCompleted",
  // Agent stop (success + failure)
  "Stop", "StopFailure",
  // Permissions
  "PermissionRequest", "PermissionDenied",
  // Context compaction
  "PreCompact", "PostCompact",
  // Misc
  "Notification"
];

const clients = new Set();

const server = http.createServer((req, res) => {
  // CORS for browsers / extensions
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204); res.end(); return;
  }

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(statusPage());
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, clients: clients.size }));
    return;
  }

  if (req.method === "POST" && (req.url === "/hook" || req.url === "/event")) {
    readBody(req).then((body) => {
      let payload;
      try { payload = body ? JSON.parse(body) : {}; }
      catch { res.writeHead(400); res.end("invalid json"); return; }

      const event = req.url === "/hook" ? translateHook(payload) : normalizeEvent(payload);
      if (event) broadcast(event);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, broadcasted: !!event }));
    });
    return;
  }

  if (req.method === "GET" && req.url === "/hook-status") {
    hookStatus().then((status) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status));
    });
    return;
  }

  if (req.method === "POST" && req.url === "/install-hooks") {
    installHooks()
      .then((result) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      })
      .catch((err) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      });
    return;
  }

  if (req.method === "POST" && req.url === "/uninstall-hooks") {
    uninstallHooks()
      .then((result) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      })
      .catch((err) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      });
    return;
  }

  res.writeHead(404); res.end("not found");
});

// ── Hook install ──

function hookCommand() {
  if (platform() === "win32") {
    return `powershell -NoProfile -ExecutionPolicy Bypass -File "${HOOK_SCRIPT_WIN}"`;
  }
  return HOOK_SCRIPT_UNIX;
}

async function readSettings() {
  try {
    const txt = await readFile(SETTINGS_PATH, "utf8");
    return JSON.parse(txt);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

async function hookStatus() {
  const settings = await readSettings();
  const expected = hookCommand();
  const installed = {};
  let allInstalled = true;
  for (const ev of HOOK_EVENTS) {
    const entries = settings?.hooks?.[ev] ?? [];
    const has = entries.some((g) =>
      (g?.hooks ?? []).some((h) => h?.command === expected)
    );
    installed[ev] = has;
    if (!has) allInstalled = false;
  }
  return {
    ok: true,
    installed: allInstalled,
    per_event: installed,
    settings_path: SETTINGS_PATH,
    hook_command: expected,
    settings_file_exists: existsSync(SETTINGS_PATH)
  };
}

async function installHooks() {
  const settings = await readSettings();
  const expected = hookCommand();

  // Backup if file exists.
  if (existsSync(SETTINGS_PATH)) {
    const bak = `${SETTINGS_PATH}.bak.${Date.now()}`;
    await copyFile(SETTINGS_PATH, bak);
    log(`backed up settings → ${bak}`);
  } else {
    await mkdir(dirname(SETTINGS_PATH), { recursive: true });
  }

  settings.hooks ??= {};
  let added = 0;
  for (const ev of HOOK_EVENTS) {
    settings.hooks[ev] ??= [];
    const groups = settings.hooks[ev];
    // Check whether any group already contains our exact command.
    const alreadyPresent = groups.some((g) =>
      (g?.hooks ?? []).some((h) => h?.command === expected)
    );
    if (alreadyPresent) continue;
    groups.push({
      matcher: ".*",
      hooks: [{ type: "command", command: expected }]
    });
    added++;
  }

  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  log(`installed hooks (added ${added} of ${HOOK_EVENTS.length} events)`);
  return { ok: true, added, total: HOOK_EVENTS.length, hook_command: expected, settings_path: SETTINGS_PATH };
}

async function uninstallHooks() {
  const settings = await readSettings();
  if (!settings.hooks) return { ok: true, removed: 0 };
  const expected = hookCommand();

  // Backup
  if (existsSync(SETTINGS_PATH)) {
    const bak = `${SETTINGS_PATH}.bak.${Date.now()}`;
    await copyFile(SETTINGS_PATH, bak);
  }

  let removed = 0;
  for (const ev of HOOK_EVENTS) {
    const groups = settings.hooks[ev];
    if (!Array.isArray(groups)) continue;
    settings.hooks[ev] = groups
      .map((g) => {
        if (!g?.hooks) return g;
        const filtered = g.hooks.filter((h) => h?.command !== expected);
        if (filtered.length !== g.hooks.length) removed += g.hooks.length - filtered.length;
        return { ...g, hooks: filtered };
      })
      .filter((g) => (g.hooks ?? []).length > 0);
    if (settings.hooks[ev].length === 0) delete settings.hooks[ev];
  }

  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  return { ok: true, removed };
}

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (socket, req) => {
  clients.add(socket);
  log(`+ ws client (total ${clients.size}) from ${req.socket.remoteAddress}`);
  socket.on("close", () => {
    clients.delete(socket);
    log(`- ws client (total ${clients.size})`);
  });
});

function broadcast(event) {
  const msg = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
  log(`→ ${event.type} ${event.sessionId ?? ""} ${event.tool_name ?? ""}`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Translate a Claude Code hook payload (or our own pre-normalized event)
// into the schema the extension expects.
function translateHook(payload) {
  // Claude Code hook payloads contain hook_event_name + flat context fields.
  // The exact shape varies per event; this stays defensive.

  const eventName = payload.hook_event_name || payload.event || payload.type;
  const sessionId = payload.session_id || payload.sessionId || "default";
  const cwd       = payload.cwd || payload.working_directory;
  const ts        = Date.now();
  // For Subagent* events the agent's own session_id is usually the subagent id,
  // and the parent is referenced separately.
  const parentId  = payload.parent_session_id || payload.parentSessionId || payload.parent_id || null;
  const base = { sessionId, cwd, ts, agent_name: payload.agent_name, parentId };

  switch (eventName) {
    // ── Session lifecycle ──
    case "SessionStart":
    case "session_start":
      return { ...base, type: "session_start" };

    case "SessionEnd":
    case "session_end":
      return { ...base, type: "session_end" };

    case "UserPromptSubmit":
    case "user_prompt":
      return {
        ...base,
        type: "user_prompt",
        prompt: payload.prompt || payload.user_prompt || payload.message
      };

    // ── Tool calls ──
    case "PreToolUse":
    case "pre_tool_use":
      return {
        ...base,
        type: "pre_tool_use",
        tool_name:  payload.tool_name || payload.tool || "tool",
        tool_input: payload.tool_input || payload.input || {}
      };

    case "PostToolUse":
    case "post_tool_use":
      return {
        ...base,
        type: "post_tool_use",
        tool_name: payload.tool_name || payload.tool || "tool",
        success:   payload.success !== false
      };

    case "PostToolUseFailure":
      return {
        ...base,
        type: "post_tool_use",
        tool_name: payload.tool_name || payload.tool || "tool",
        success:   false,
        error:     payload.error || payload.message || "tool failed"
      };

    // ── Subagent / Task lifecycle ──
    // A "Subagent" in Claude Code is a child session spawned via the Task tool.
    // We model each subagent as its own pixel character; the spawn references
    // the parent so we can show a "delegated" link in the activity ticker.
    case "SubagentStart": {
      const sub = payload.subagent || payload.agent || {};
      return {
        ...base,
        type: "subagent_start",
        subagent_type: sub.type || payload.subagent_type || payload.agent_type,
        prompt: payload.prompt || sub.description || payload.description,
        agent_name: payload.agent_name || sub.name
      };
    }
    case "SubagentStop":
      return {
        ...base,
        type: "subagent_stop",
        success: payload.success !== false,
        error:   payload.error || null
      };

    case "TaskCreated":
      return {
        ...base,
        type: "task_created",
        subagent_id: payload.subagent_id || payload.task_id,
        subagent_type: payload.subagent_type || payload.agent_type,
        description: payload.description || payload.prompt
      };
    case "TaskCompleted":
      return {
        ...base,
        type: "task_completed",
        subagent_id: payload.subagent_id || payload.task_id,
        success: payload.success !== false,
        summary: payload.summary || payload.result
      };

    // ── Agent stop ──
    case "Stop":
    case "stop":
      return { ...base, type: "stop" };

    case "StopFailure":
      return { ...base, type: "stop", failure: true, error: payload.error || payload.message };

    // ── Permissions ──
    case "PermissionRequest":
      return {
        ...base,
        type: "permission_request",
        tool_name: payload.tool_name || payload.tool,
        reason:    payload.reason || payload.message
      };
    case "PermissionDenied":
      return {
        ...base,
        type: "permission_denied",
        tool_name: payload.tool_name || payload.tool,
        reason:    payload.reason || payload.message
      };

    // ── Context compaction ──
    case "PreCompact":
      return { ...base, type: "pre_compact" };
    case "PostCompact":
      return { ...base, type: "post_compact", saved_tokens: payload.saved_tokens };

    case "Notification":
    case "notification":
      // Free-form text shown as a speech bubble.
      return {
        ...base,
        type: "assistant_msg",
        text: payload.message || payload.text || ""
      };

    default:
      if (payload.text) {
        return { ...base, type: "thinking", text: String(payload.text).slice(0, 200) };
      }
      return null;
  }
}

function normalizeEvent(payload) {
  if (!payload || !payload.type) return null;
  return {
    sessionId: payload.sessionId || "default",
    cwd: payload.cwd,
    ts: payload.ts || Date.now(),
    ...payload
  };
}

function statusPage() {
  return `<!doctype html><meta charset="utf-8" />
  <title>Claude Pixel Agent — Bridge</title>
  <style>
    body { font: 14px ui-sans-serif, system-ui; background: #0f1020; color: #e8e9f7; padding: 24px; }
    code { background: #181a30; padding: 2px 6px; border-radius: 3px; color: #6acef0; }
    h1 { margin-top: 0; }
    .card { background: #15172b; padding: 16px; border-radius: 8px; border: 1px solid #2a2e55; max-width: 720px; }
    a { color: #6acef0; }
  </style>
  <div class="card">
    <h1>Claude Pixel Agent bridge</h1>
    <p>Listening on <code>http://${HOST}:${PORT}</code>. WebSocket: <code>ws://${HOST}:${PORT}/ws</code>.</p>
    <p>Connected extension clients: <strong>${clients.size}</strong></p>
    <h3>Endpoints</h3>
    <ul>
      <li><code>POST /hook</code> — Claude Code hook payloads (configure in <code>~/.claude/settings.json</code>)</li>
      <li><code>POST /event</code> — pre-normalized events for testing</li>
      <li><code>POST /install-hooks</code> — automatically add notify.sh hook entries to settings.json</li>
      <li><code>POST /uninstall-hooks</code> — remove the hook entries</li>
      <li><code>GET /hook-status</code> — check which events are wired up</li>
      <li><code>GET /health</code> — JSON health check</li>
    </ul>
    <p>See <code>hooks/example-settings.json</code> in the repo for the manual setup, or use the dashboard's <strong>Install hooks</strong> button.</p>
  </div>`;
}

function log(...args) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}]`, ...args);
}

server.listen(PORT, HOST, () => {
  log(`pixel-agent bridge listening on http://${HOST}:${PORT}  (ws ${HOST}:${PORT}/ws)`);
});

process.on("SIGINT", () => { log("shutting down"); server.close(() => process.exit(0)); });
