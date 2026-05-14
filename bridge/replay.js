#!/usr/bin/env node
// Replay real Claude Code session transcripts through the local bridge.
//
// Reads JSONL transcripts (the same files that power the Tasks UI) and POSTs
// normalized events to http://127.0.0.1:9876/event so the extension shows
// real session names, tool calls, durations, and counts.
//
// Modes:
//   --once    replay all past events, scaled to <duration> seconds total
//   --watch   tail transcripts and forward new entries live (best-effort)
//
// Examples:
//   node bridge/replay.js                     # latest project's subagents
//   node bridge/replay.js --watch
//   node bridge/replay.js --dir /path/to/session-uuid
//   node bridge/replay.js --duration 30       # compress past activity to 30s

import { readdirSync, readFileSync, statSync, watch } from "node:fs";
import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";
import { setTimeout as wait } from "node:timers/promises";

const args = parseArgs(process.argv.slice(2));
const BRIDGE = args.bridge || "http://127.0.0.1:9876/event";
const DURATION_SEC = Number(args.duration ?? 30); // compress past into this window
const PROJECTS_ROOT = join(homedir(), ".claude", "projects");

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) { out[key] = true; }
      else { out[key] = next; i++; }
    } else { out._.push(a); }
  }
  return out;
}

function findLatestProjectDir() {
  if (args.dir) {
    const dir = args.dir;
    // Try to recover project + uuid from path: .../projects/<project>/<uuid>/subagents
    const parts = dir.split("/").filter(Boolean);
    const subIdx = parts.lastIndexOf("subagents");
    const uuid    = subIdx > 0 ? parts[subIdx - 1] : "unknown";
    const project = subIdx > 1 ? parts[subIdx - 2] : "unknown";
    return { dir, mtime: Date.now(), project, uuid, main: null };
  }
  // Find any project whose any jsonl has been modified in the last hour.
  const candidates = [];
  for (const p of readdirSync(PROJECTS_ROOT)) {
    const projDir = join(PROJECTS_ROOT, p);
    if (!statSync(projDir).isDirectory()) continue;
    for (const f of readdirSync(projDir)) {
      const full = join(projDir, f);
      if (f.endsWith(".jsonl")) {
        const st = statSync(full);
        if (Date.now() - st.mtimeMs < 60 * 60 * 1000) {
          // Active session — its uuid (filename without .jsonl) is the subagents subdir.
          const sessionUuid = f.replace(/\.jsonl$/, "");
          const subagentsDir = join(projDir, sessionUuid, "subagents");
          candidates.push({ dir: subagentsDir, mtime: st.mtimeMs, project: p, uuid: sessionUuid, main: full });
        }
      }
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0];
}

function readJsonl(path) {
  const txt = readFileSync(path, "utf8");
  const out = [];
  for (const line of txt.split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return out;
}

/** Extract a friendly title from the first user message of a subagent transcript. */
function deriveTitle(firstUserContent) {
  if (!firstUserContent) return null;
  const txt = String(firstUserContent);

  // "Story X.Y" or "Story X.Y-followup"
  const storyMatch = txt.match(/Story\s+([0-9a-z\.\-]+(?:-followup)?)/i);

  // "You are Atlas (BE) + Fae (FE)" / "You are Iris" / "You are Sec (Security) + Iris (Staff SWE)"
  // Match a chain of "Name (role)" joined by " + ". Stops at the first
  // lowercase/word that doesn't fit the pattern (e.g. "co-piloting").
  const agentsMatch = txt.match(/You are\s+([A-Z][a-zA-Z]+(?:\s*\([^)]*\))?(?:\s*\+\s*[A-Z][a-zA-Z]+(?:\s*\([^)]*\))?)*)/);

  // Component name from story file: e.g. .../stories/2-3-audittraildrawer-component-on-dealer-detail.md
  const componentMatch = txt.match(/stories\/[\d\.\-]+-([a-z][a-z0-9\-]+?)(?:[\.\-]|\b)/i);

  const cleanAgents = (agentsMatch?.[1] ?? "")
    .replace(/\s*\([^)]*\)/g, "")        // drop "(BE)", "(Security)" etc.
    .replace(/\s+/g, "")                 // "Atlas+Fae"
    .replace(/\++$/, "");                // trailing +
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
  return txt.replace(/\s+/g, " ").slice(0, 60).trim();
}

function toTitleCase(slug) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

function getFirstUserContent(entries) {
  for (const e of entries) {
    if (e.type === "user" && e.message?.content) {
      return typeof e.message.content === "string"
        ? e.message.content
        : (e.message.content[0]?.text ?? JSON.stringify(e.message.content).slice(0, 200));
    }
  }
  return null;
}

function extractEvents(entries, sessionId) {
  const events = [];
  let startTs = null;

  for (const e of entries) {
    const ts = e.timestamp ? Date.parse(e.timestamp) : (e.ts ?? null);
    if (ts && !startTs) startTs = ts;

    if (e.type === "user" && events.length === 0) {
      events.push({ ts, type: "session_start", sessionId, cwd: e.cwd });
      const content = typeof e.message?.content === "string" ? e.message.content : (e.message?.content?.[0]?.text ?? "");
      events.push({ ts, type: "user_prompt", sessionId, prompt: content });
    }

    if (e.type === "assistant" && e.message?.content) {
      for (const block of e.message.content) {
        if (block?.type === "tool_use") {
          events.push({
            ts,
            type: "pre_tool_use",
            sessionId,
            tool_name: block.name,
            tool_input: block.input ?? {}
          });
        }
        if (block?.type === "text" && block.text) {
          events.push({ ts, type: "assistant_msg", sessionId, text: block.text });
        }
        if (block?.type === "thinking" && block.thinking) {
          events.push({ ts, type: "thinking", sessionId, text: block.thinking });
        }
      }
    }

    if (e.type === "user" && Array.isArray(e.message?.content)) {
      for (const block of e.message.content) {
        if (block?.type === "tool_result") {
          events.push({ ts, type: "post_tool_use", sessionId, tool_name: block.tool_use_id ? "" : "tool", success: !block.is_error });
        }
      }
    }
  }
  // Cap to most recent 200 events per session — keeps the replay snappy.
  return events.slice(-200);
}

async function post(event) {
  try {
    await fetch(BRIDGE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event)
    });
  } catch (err) {
    console.error("POST failed:", err.message);
  }
}

async function replay() {
  const latest = findLatestProjectDir();
  if (!latest) { console.error("No recent Claude Code sessions found."); process.exit(1); }

  console.log(`Project: ${latest.project}`);
  console.log(`Session UUID: ${latest.uuid}`);
  console.log(`Subagents dir: ${latest.dir}`);

  const subagentFiles = (() => {
    try { return readdirSync(latest.dir).filter((f) => f.endsWith(".jsonl")); }
    catch { return []; }
  })();

  console.log(`Found ${subagentFiles.length} subagent transcripts`);

  const sessions = [];

  for (const f of subagentFiles) {
    const path = join(latest.dir, f);
    const entries = readJsonl(path);
    if (entries.length === 0) continue;
    const sessionId = f.replace(/\.jsonl$/, "");
    const firstUser = getFirstUserContent(entries);
    const title = deriveTitle(firstUser) || sessionId;
    const events = extractEvents(entries, sessionId);
    if (events.length === 0) continue;
    sessions.push({ sessionId, title, cwd: dirname(latest.dir), events });
    console.log(`  · ${title.padEnd(50).slice(0, 50)}  ${events.length} events`);
  }

  if (sessions.length === 0) {
    console.error("No subagent events to replay.");
    process.exit(1);
  }

  // Merge all events, sort by ts, then compress timeline.
  const all = [];
  for (const s of sessions) {
    // Inject the derived title as the first user_prompt so the extension uses it as the agent name.
    const firstTs = s.events[0]?.ts ?? Date.now();
    all.push({ ts: firstTs, type: "session_start", sessionId: s.sessionId, cwd: s.cwd });
    all.push({ ts: firstTs + 1, type: "user_prompt", sessionId: s.sessionId, prompt: s.title });
    for (const e of s.events) {
      if (e.type === "session_start" || e.type === "user_prompt") continue;
      all.push(e);
    }
  }
  all.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));

  // Compress into the target duration.
  const t0 = all[0].ts ?? Date.now();
  const tN = all[all.length - 1].ts ?? t0 + 1;
  const span = Math.max(1, tN - t0);
  const targetMs = DURATION_SEC * 1000;

  console.log(`Replaying ${all.length} events spanning ${(span/1000).toFixed(0)}s → compressed to ${DURATION_SEC}s.`);
  console.log(`Posting to ${BRIDGE}`);
  console.log("");

  const start = Date.now();
  for (const ev of all) {
    const offsetReal = (ev.ts ?? t0) - t0;
    const offsetSim = (offsetReal / span) * targetMs;
    const fireAt = start + offsetSim;
    const wait_ms = Math.max(0, fireAt - Date.now());
    if (wait_ms > 0) await wait(wait_ms);
    // Strip the ts so the bridge stamps fresh times → durations look live.
    const { ts, ...payload } = ev;
    await post(payload);
  }
  console.log("\n✓ Replay complete.");
}

if (args.watch) {
  // Simple tail-watcher: re-run replay on file changes.
  console.log("watch mode — Ctrl-C to stop");
  await replay();
  const latest = findLatestProjectDir();
  if (latest) {
    watch(latest.dir, { recursive: false }, async () => {
      console.log("change detected — re-replaying");
      await replay();
    });
  }
} else {
  await replay();
}
