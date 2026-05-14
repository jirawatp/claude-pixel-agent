// Bridge client — connects to the background service worker port and dispatches
// agent events to a renderer instance, updating character state.

import { eventToBubble, EVENT_TYPES } from "./events.js";
import { upsertAgent } from "../state/store.js";
import { defaultCustomization } from "../renderer/sprite-factory.js";
import { PALETTE } from "../../assets/palette/palette.js";
import { ZONES, zoneForTool, zoneForRole, pickSpotInZone, jitter } from "../renderer/zones.js";
import { roleForName } from "../state/roles.js";

export class BridgeClient {
  /**
   * @param {OfficeRenderer} renderer
   * @param {object} options
   * @param {(status: string, url: string) => void} options.onStatus
   * @param {(ev: object) => void} options.onEvent
   */
  constructor(renderer, { onStatus, onEvent, agentDefaults } = {}) {
    this.renderer = renderer;
    this.onStatus = onStatus ?? (() => {});
    this.onEvent = onEvent ?? (() => {});
    this.agentDefaults = agentDefaults ?? {};
    this.port = null;
    this.usedDesks = new Set(); // "x,y" of claimed desk spots
    this.homeDesks = new Map(); // sessionId → { x, y, zone }
  }

  connect() {
    // Prefer the extension runtime so the service worker owns the socket.
    if (typeof chrome !== "undefined" && chrome.runtime?.connect) {
      try {
        this.port = chrome.runtime.connect({ name: "pixel-agent" });
        this.port.onMessage.addListener((msg) => {
          if (msg?.type === "bridge_status") {
            this.onStatus(msg.status, msg.url);
          } else if (msg?.type === "agent_event") {
            this.handleEvent(msg.event);
          }
        });
        this.port.onDisconnect.addListener(() => {
          this.onStatus("disconnected", "");
          setTimeout(() => this.connect(), 1000);
        });
        return;
      } catch { /* fall through to direct WS */ }
    }

    // Fallback: when running outside the extension (dev/testing via http://),
    // open the WebSocket to the bridge directly.
    this.connectDirect();
  }

  connectDirect(url = "ws://127.0.0.1:9876/ws") {
    try {
      this.directWs = new WebSocket(url);
    } catch {
      this.onStatus("disconnected", url);
      setTimeout(() => this.connectDirect(url), 2000);
      return;
    }
    this.directWs.addEventListener("open", () => this.onStatus("connected", url));
    this.directWs.addEventListener("message", (e) => {
      try { this.handleEvent(JSON.parse(e.data)); } catch {}
    });
    this.directWs.addEventListener("close", () => {
      this.onStatus("disconnected", url);
      setTimeout(() => this.connectDirect(url), 2000);
    });
    this.directWs.addEventListener("error", () => {
      try { this.directWs.close(); } catch {}
    });
  }

  reconnect() {
    try { this.port?.postMessage({ type: "reconnect" }); } catch {}
  }

  setBridgeUrl(url) {
    try { this.port?.postMessage({ type: "set_bridge_url", url }); } catch {}
  }

  /**
   * Pick (and remember) a home desk for a session, based on the agent name's
   * first identifier. Subsequent calls return the same desk.
   */
  homeDeskFor(sessionId, name) {
    if (this.homeDesks.has(sessionId)) return this.homeDesks.get(sessionId);
    const zoneKey = zoneForRole(name);
    const spot = pickSpotInZone(zoneKey, this.usedDesks);
    const home = { x: spot.x, y: spot.y, zone: zoneKey, deskKey: spot.deskKey };
    this.homeDesks.set(sessionId, home);
    return home;
  }

  releaseHomeDesk(sessionId) {
    const home = this.homeDesks.get(sessionId);
    if (home?.deskKey) this.usedDesks.delete(home.deskKey);
    this.homeDesks.delete(sessionId);
  }

  async ensureAgent(ev) {
    const sessionId = ev.sessionId ?? "default";
    const c = this.renderer.getCharacter(sessionId);
    if (c) return c;
    const stored = this.agentDefaults[sessionId];
    const name = stored?.name ?? ev.agent_name ?? deriveName(sessionId, ev.cwd);
    const customization = stored?.customization ?? defaultCustomization(hash(sessionId));
    const home = this.homeDeskFor(sessionId, name);
    const created = this.renderer.addCharacter({
      id: sessionId, name, customization, x: home.x, y: home.y
    });
    created.role = roleForName(name);
    created.cwd  = ev.cwd ?? null;
    upsertAgent(sessionId, { name, customization, cwd: ev.cwd });
    return created;
  }

  async handleEvent(ev) {
    this.onEvent(ev);
    if (!ev || !ev.type) return;
    // Re-emit so the dashboard ticker (and anything else) can subscribe.
    try {
      document.dispatchEvent(new CustomEvent("bridge-event", { detail: ev }));
    } catch { /* no DOM (e.g. service-worker context) — ignore */ }
    const sessionId = ev.sessionId ?? "default";
    const c = await this.ensureAgent(ev);

    // ── Session metadata tracking (mirrors Claude Code's Tasks UI) ──
    if (ev.ts && c.startedAt > ev.ts) c.startedAt = ev.ts;
    if (typeof ev.tokens === "number")    c.tokens = ev.tokens;
    if (typeof ev.tool_count === "number") c.toolUseCount = ev.tool_count;

    const home = this.homeDeskFor(sessionId, c.name);

    switch (ev.type) {
      case EVENT_TYPES.SESSION_START: {
        // Re-derive home desk in case name changed.
        this.renderer.walkTo(sessionId, home.x, home.y);
        c.endedAt = null;
        break;
      }
      case EVENT_TYPES.USER_PROMPT: {
        // Capture the first user prompt as the agent's persona / task brief.
        if (!c.persona && ev.prompt) c.persona = truncatePersona(ev.prompt);
        // Use first non-empty user prompt as the agent's display title.
        if (!c.titleLocked && ev.prompt) {
          const newName = truncateTitle(ev.prompt);
          c.name = newName;
          c.role = roleForName(newName);
          c.titleLocked = true;
          // Re-assign home desk based on the new (more accurate) name.
          this.releaseHomeDesk(sessionId);
          const newHome = this.homeDeskFor(sessionId, newName);
          this.renderer.walkTo(sessionId, newHome.x, newHome.y);
          upsertAgent(sessionId, { name: newName });
        }
        break;
      }
      case EVENT_TYPES.PRE_TOOL_USE: {
        c.toolUseCount += 1;
        c.toolHistogram[ev.tool_name] = (c.toolHistogram[ev.tool_name] ?? 0) + 1;
        c.currentTool = ev.tool_name;
        c.statusColor = PALETTE.statusWorking;
        // Route to the right room for this tool.
        const targetZone = zoneForTool(ev.tool_name);
        if (targetZone) {
          const spot = pickSpotInZone(targetZone, new Set());
          const j = jitter(spot, 1.5);
          this.renderer.walkTo(sessionId, j.x, j.y);
        } else {
          // Default: stay at home desk (don't walk if already close enough)
          if (Math.hypot(c.x - home.x, c.y - home.y) > 0.5) {
            this.renderer.walkTo(sessionId, home.x, home.y);
          }
        }
        break;
      }
      case EVENT_TYPES.POST_TOOL_USE: {
        c.currentTool = null;
        // Return to home desk after a brief stay.
        if (Math.hypot(c.x - home.x, c.y - home.y) > 0.5) {
          this.renderer.walkTo(sessionId, home.x, home.y);
        }
        break;
      }
      case EVENT_TYPES.STOP: {
        c.endedAt = Date.now();
        c.currentTool = null;
        c.statusColor = PALETTE.statusIdle;
        // Walk to the coffee room to take a break.
        const coffeeSpot = pickSpotInZone("coffee", new Set());
        const j = jitter(coffeeSpot, 1.5);
        this.renderer.walkTo(sessionId, j.x, j.y);
        break;
      }
      case EVENT_TYPES.SESSION_END: {
        c.endedAt = Date.now();
        c.currentTool = null;
        // Walk off-screen then remove.
        this.renderer.walkTo(sessionId, -2, c?.y ?? 8);
        setTimeout(() => {
          this.renderer.removeCharacter(sessionId);
          this.releaseHomeDesk(sessionId);
        }, 3000);
        break;
      }
    }

    const bubble = eventToBubble(ev);
    if (bubble) {
      this.renderer.say(sessionId, bubble.text, {
        kind: bubble.kind,
        face: bubble.face,
        activity: bubble.activity,
        ttl: ttlForEvent(ev.type)
      });
    }

  }

  stopSession(sessionId) {
    this.handleEvent({ type: EVENT_TYPES.STOP, sessionId, ts: Date.now() });
  }
}

function truncateTitle(s) {
  s = String(s).trim().replace(/\s+/g, " ");
  return s.length > 48 ? s.slice(0, 47) + "…" : s;
}

function truncatePersona(s) {
  s = String(s).trim();
  if (s.length <= 400) return s;
  return s.slice(0, 397) + "…";
}

function ttlForEvent(type) {
  switch (type) {
    case EVENT_TYPES.PRE_TOOL_USE:  return 4000;
    case EVENT_TYPES.POST_TOOL_USE: return 2000;
    case EVENT_TYPES.THINKING:      return 5000;
    case EVENT_TYPES.ASSISTANT_MSG: return 8000;
    case EVENT_TYPES.STOP:          return 6000;
    default:                        return 5000;
  }
}

function deriveName(sessionId, cwd) {
  if (cwd) {
    const parts = String(cwd).split("/").filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return `agent-${sessionId.slice(0, 4)}`;
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < (str ?? "").length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
