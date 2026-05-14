// Character entity — owns position, motion, state, bubble.

import { drawCharacter, defaultCustomization, SPRITE_W, SPRITE_H } from "./sprite-factory.js";
import { drawBubble, drawNameTag } from "./speech-bubble.js";
import { TILE_PX } from "./tilemap.js";
import { PALETTE } from "../../assets/palette/palette.js";
import { roleForName } from "../state/roles.js";

const WALK_SPEED = 2.0;        // tiles per second
const IDLE_WANDER_MS_MIN = 5000;
const IDLE_WANDER_MS_MAX = 12000;
const BUBBLE_DEFAULT_TTL = 6000;

let nextId = 1;

export function createCharacter({ id, name, customization, x = 4, y = 8 } = {}) {
  return {
    id: id ?? `agent-${nextId++}`,
    name: name ?? "Agent",
    customization: customization ?? defaultCustomization(0),
    x, y,
    targetX: x,
    targetY: y,
    facing: 1,
    state: "idle", // idle | walking | thinking | speaking | stopped
    walkFrame: 0,
    walkPhase: 0,
    idleBob: 0,
    bubble: null,
    bubbleUntil: 0,
    statusColor: PALETTE.statusIdle,
    activity: null,            // short verb, e.g. "Running Bash"
    currentTool: null,          // currently-active tool name
    toolUseCount: 0,            // number of tool calls so far
    toolHistogram: Object.create(null), // { [tool]: count }
    persona: null,              // truncated text from first user prompt
    role: null,                 // { key, label, full, color } from roles.js
    cwd: null,                  // working directory
    startedAt: Date.now(),      // session start (ms)
    endedAt: null,              // session end (ms) — set on stop
    titleLocked: false,         // true once a title is derived from a user prompt
    nextWanderAt: performance.now() + 3000 + Math.random() * 5000
  };
}

export function sayBubble(c, text, opts = {}) {
  c.bubble = { text, kind: opts.kind ?? "speech" };
  c.bubbleUntil = performance.now() + (opts.ttl ?? BUBBLE_DEFAULT_TTL);
  c.state = opts.kind === "thought" ? "thinking" : "speaking";
  c.customization = { ...c.customization, face: opts.face ?? (opts.kind === "thought" ? "think" : "idle") };
  c.statusColor = opts.kind === "thought" ? PALETTE.statusThinking : PALETTE.statusWorking;
  c.activity = opts.activity ?? c.activity;
}

export function formatElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const total = Math.floor(ms / 1000);
  if (total < 60) return `${total}s`;
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min < 60) return sec ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const restMin = min % 60;
  return restMin ? `${hr}h ${restMin}m` : `${hr}h`;
}

export function formatTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tokens`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k tokens`;
  return `${n} tokens`;
}

/**
 * Status line that mirrors Claude Code's Tasks UI:
 *   "Agent · Running Bash · 2m 24s · 103.3k tokens · 43 tool uses"
 * Pieces that aren't known are skipped.
 */
export function statusLine(c) {
  const parts = ["Agent"];
  if (c.endedAt) {
    parts.push("Done");
  } else if (c.currentTool) {
    parts.push(`Running ${c.currentTool}`);
  } else if (c.state === "thinking") {
    parts.push("Thinking");
  } else {
    parts.push(c.activity ?? "Idle");
  }
  const elapsed = (c.endedAt ?? Date.now()) - c.startedAt;
  parts.push(formatElapsed(elapsed));
  const tok = formatTokens(c.tokens);
  if (tok) parts.push(tok);
  if (c.toolUseCount > 0) parts.push(`${c.toolUseCount} tool use${c.toolUseCount === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function walkTo(c, tx, ty) {
  c.targetX = tx;
  c.targetY = ty;
  if (Math.abs(tx - c.x) > 0.01 || Math.abs(ty - c.y) > 0.01) {
    c.state = "walking";
    c.facing = tx >= c.x ? 1 : -1;
  }
}

export function updateCharacter(c, dt, map) {
  const now = performance.now();

  // Animations
  c.idleBob = (c.idleBob + dt / 600) % 1;
  c.walkPhase = (c.walkPhase + dt / 250) % 1;
  c.walkFrame = c.walkPhase < 0.5 ? 1 : 2;

  // Bubble expiry
  if (c.bubble && now > c.bubbleUntil) {
    c.bubble = null;
    if (c.state === "speaking" || c.state === "thinking") {
      c.state = "idle";
      c.statusColor = PALETTE.statusIdle;
      c.customization = { ...c.customization, face: "idle" };
    }
  }

  // Motion
  const dx = c.targetX - c.x;
  const dy = c.targetY - c.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 0.02) {
    const step = WALK_SPEED * (dt / 1000);
    if (step >= dist) {
      c.x = c.targetX; c.y = c.targetY;
    } else {
      c.x += (dx / dist) * step;
      c.y += (dy / dist) * step;
    }
    c.facing = dx >= 0 ? 1 : -1;
    if (c.state !== "speaking" && c.state !== "thinking") c.state = "walking";
  } else if (c.state === "walking") {
    c.state = "idle";
  }

  // Idle wander — if truly idle, pick a new wander target occasionally
  if (c.state === "idle" && now >= c.nextWanderAt) {
    const wx = 2 + Math.floor(Math.random() * (map.cols - 4));
    const wy = 6 + Math.floor(Math.random() * (map.rows - 8));
    walkTo(c, wx, wy);
    c.nextWanderAt = now + IDLE_WANDER_MS_MIN + Math.random() * (IDLE_WANDER_MS_MAX - IDLE_WANDER_MS_MIN);
  }
}

export function drawCharacterEntity(ctx, c, scale) {
  // Sprite is anchored such that the character "feet" sit at (x+0.5, y+1) in tile coords
  const px = c.x * TILE_PX * scale + (TILE_PX * scale - SPRITE_W * scale) / 2;
  // Subtle idle bob
  const bob = c.state === "idle" ? Math.sin(c.idleBob * Math.PI * 2) * 1 : 0;
  const py = c.y * TILE_PX * scale - (SPRITE_H - TILE_PX) * scale + bob * scale;

  // Shadow
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  ctx.ellipse(
    px + (SPRITE_W * scale) / 2,
    py + SPRITE_H * scale - 1,
    (SPRITE_W * scale) / 3,
    2 * scale,
    0, 0, Math.PI * 2
  );
  ctx.fill();

  let frame = "idle";
  if (c.state === "walking") frame = c.walkFrame === 1 ? "walk1" : "walk2";
  drawCharacter(ctx, px, py, scale, c.customization, frame, c.facing);

  // Name + role tag under feet
  drawNameTag(
    ctx,
    px + (SPRITE_W * scale) / 2,
    py + SPRITE_H * scale + 4,
    c.name,
    c.role ?? roleForName(c.name),
    c.statusColor
  );

  // Bubble
  if (c.bubble) {
    drawBubble(ctx, px + (SPRITE_W * scale) / 2, py, c.bubble.text, c.bubble.kind);
  }
}
