// Dashboard composition — wires the renderer, bridge, editors, and the new
// polish layer (CRT chrome, HUD, zone legend, mini-map, activity ticker,
// at-work indicators, grouped agent panel).

import { OfficeRenderer } from "../src/renderer/canvas-renderer.js";
import { BridgeClient }   from "../src/bridge/client.js";
import { loadAll, saveMap, upsertAgent, setBridgeUrl, subscribe } from "../src/state/store.js";
import { AvatarEditor }   from "../src/customization/avatar-editor.js";
import { LayoutEditor }   from "../src/customization/office-editor.js";
import { drawCharacter }  from "../src/renderer/sprite-factory.js";
import { statusLine, formatElapsed } from "../src/renderer/character.js";
import { runDemo, stopDemo } from "../src/bridge/demo.js";
import { ROLES, roleForName } from "../src/state/roles.js";
import { ZONES, ZONE_COLOR, agentZone } from "../src/renderer/zones.js";
import { workIndicator, tickerKind, kindLabel } from "../src/renderer/work-indicator.js";

const canvas      = document.getElementById("office");
const statusDot   = document.getElementById("status-dot");
const statusText  = document.getElementById("status-text");
const statusPort  = document.getElementById("status-port");
const stageHint   = document.getElementById("stage-hint");

let renderer;
let bridge;
let avatarEditor;     // built lazily
let layoutEditor;     // built lazily
let state;

let expandedAgentId = null;        // single expanded card at a time
let activeTab       = "office";
const tickerBuffer  = [];          // newest at index 0; cap = 50

const ZONES_LIST = [
  ["library",     "library",     ZONE_COLOR.library],
  ["meeting",     "meeting",     ZONE_COLOR.meeting],
  ["coffee",      "coffee",      ZONE_COLOR.coffee],
  ["strategy",    "strategy",    ZONE_COLOR.strategy],
  ["engineering", "engineering", ZONE_COLOR.engineering],
  ["design",      "design",      ZONE_COLOR.design],
  ["ops",         "ops",         ZONE_COLOR.ops]
];

// ───────────────────────────────── boot ─────────────────────────────────

async function init() {
  state = await loadAll();

  renderer = new OfficeRenderer(canvas, { map: state.map, scale: state.ui?.scale ?? 3 });
  renderer.start();

  bridge = new BridgeClient(renderer, {
    agentDefaults: state.agents,
    onStatus: setBridgeStatus,
    onEvent: () => scheduleRefresh()
  });
  bridge.connect();

  setupTabs();
  setupHUDControls();
  setupBridgePanel();   // builds #panel-bridge
  setupTickerFilters();

  buildAvatarPanel();
  buildLayoutPanel();
  buildBridgePanel();

  document.addEventListener("bridge-event", onBridgeEvent);

  // Initial paint
  refreshAll();
  setInterval(refreshAll, 1000);

  subscribe(async () => { state = await loadAll(); });

  document.getElementById("open-options")?.addEventListener("click", () => {
    if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) chrome.runtime.openOptionsPage();
    else if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      window.open(chrome.runtime.getURL("options/options.html"));
    }
  });
  document.getElementById("demo-btn")?.addEventListener("click", () => runDemo(ev => bridge.handleEvent(ev)));
}

function setBridgeStatus(status, url) {
  const connected = status === "connected";
  statusDot.classList.toggle("green", connected);
  statusDot.classList.toggle("red",   !connected);
  statusText.textContent = connected ? "Bridge online" : "Bridge offline";
  const m = (url || "").match(/:(\d+)\/?/);
  if (m) statusPort.textContent = m[1];
  // Also refresh the Connection panel's bridge status card if it's been built.
  paintBridgeStatusCard(connected, url);
}

// ───────────────────────────── tab plumbing ─────────────────────────────

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.tab;
      activeTab = name;
      document.querySelectorAll(".tab").forEach(t => t.classList.toggle("is-active", t === tab));
      document.querySelectorAll(".side-rail [data-panel]").forEach(p => {
        p.hidden = p.dataset.panel !== name;
      });
      // Layout-only behavior
      layoutEditor?.setActive(name === "layout");
    });
  });
}

// ───────────────────────────── HUD controls ─────────────────────────────

function setupHUDControls() {
  document.getElementById("zoom-in")?.addEventListener("click", () => {
    renderer.setScale(Math.min(6, renderer.scale + 1));
  });
  document.getElementById("zoom-out")?.addEventListener("click", () => {
    renderer.setScale(Math.max(1, renderer.scale - 1));
  });
  document.getElementById("zoom-fit")?.addEventListener("click", () => {
    renderer.setScale(3);
  });
}

// ───────────────────────────── render orchestration ───────────────────────

let refreshScheduled = false;
function scheduleRefresh() {
  if (refreshScheduled) return;
  refreshScheduled = true;
  requestAnimationFrame(() => { refreshScheduled = false; refreshAll(); });
}

function refreshAll() {
  const agents = collectAgents();
  renderAgentPanel(agents);
  renderHud(agents);
  renderZoneLegend(agents);
  renderMinimap(agents);
  updateStageHint(agents);
}

function collectAgents() {
  const list = [...renderer.characters.values()];
  return list.map((c) => {
    const role = c.role ?? roleForName(c.name);
    const status = c.endedAt ? "done" : (c.currentTool || c.state === "walking" || c.state === "thinking" ? "running" : "idle");
    return {
      id: c.id, name: c.name, customization: c.customization,
      role, status,
      currentTool: c.currentTool ?? null,
      state: c.state, endedAt: c.endedAt,
      activity: {
        verb:   activityVerb(c),
        tool:   c.currentTool ?? null,
        target: activityTarget(c)
      },
      toolCount: c.toolUseCount ?? 0,
      toolHistogram: c.toolHistogram ?? {},
      persona: c.persona ?? null,
      cwd:     c.cwd ?? null,
      startedAt: c.startedAt,
      elapsedMs: (c.endedAt ?? Date.now()) - c.startedAt,
      x: c.x, y: c.y,
      zone: agentZone(c),
      statusColor: c.statusColor
    };
  });
}

function activityVerb(c) {
  if (c.endedAt) return "ended";
  if (c.state === "thinking") return "thinking";
  if (c.state === "walking")  return "walking";
  if (c.currentTool) {
    const verbs = { Read: "Reading", Write: "Writing", Edit: "Editing", Bash: "Running shell",
      Grep: "Searching", Glob: "Globbing", WebFetch: "Browsing", WebSearch: "Googling",
      Task: "Delegating", TodoWrite: "Planning", MultiEdit: "Editing", NotebookEdit: "Editing notebook" };
    return verbs[c.currentTool] ?? `Using ${c.currentTool}`;
  }
  return c.activity ?? "Idle";
}
function activityTarget(c) {
  if (c.bubble?.text) return c.bubble.text;
  if (c.endedAt) return "";
  return "";
}

// ───────────────────────────── HUD ─────────────────────────────

function renderHud(agents) {
  const r = agents.filter(a => a.status === "running").length;
  const i = agents.filter(a => a.status === "idle").length;
  const t = agents.reduce((s, a) => s + a.toolCount, 0);
  setText("hud-running", r);
  setText("hud-idle",    i);
  setText("hud-tools",   t);
  setText("agent-count", agents.length);
  setText("ticker-tools", t);
}

// ───────────────────────────── Zone legend ─────────────────────────────

function renderZoneLegend(agents) {
  const legend = document.getElementById("zone-legend");
  legend.querySelectorAll(".zl-row").forEach(n => n.remove());
  for (const [key, label, color] of ZONES_LIST) {
    const count = agents.filter(a => a.zone === key).length;
    const row = document.createElement("div");
    row.className = "zl-row";
    row.innerHTML = `
      <span class="zl-swatch" style="background:${color}"></span>
      <span class="zl-label">${label}</span>
      <span class="zl-count mono">${count}</span>`;
    legend.appendChild(row);
  }
}

// ───────────────────────────── Mini-map ─────────────────────────────

function renderMinimap(agents) {
  const svg = document.getElementById("mm-svg");
  if (!svg) return;
  svg.innerHTML = "";

  // Office floor base
  const bg = svgEl("rect");
  bg.setAttribute("x", 0); bg.setAttribute("y", 0);
  bg.setAttribute("width", 24); bg.setAttribute("height", 16);
  bg.setAttribute("fill", "#0a0b18");
  svg.appendChild(bg);

  // Zone rects
  for (const [key, label, color] of ZONES_LIST) {
    const z = ZONES[key];
    if (!z) continue;
    const r = svgEl("rect");
    r.setAttribute("x", z.bounds.x);
    r.setAttribute("y", z.bounds.y);
    r.setAttribute("width", z.bounds.w);
    r.setAttribute("height", z.bounds.h);
    r.setAttribute("fill", color);
    r.setAttribute("opacity", "0.65");
    svg.appendChild(r);
  }

  // Agents
  for (const a of agents) {
    const role = a.role ?? { color: "#fff" };
    const r = svgEl("rect");
    r.setAttribute("x", (a.x - 0.5).toFixed(2));
    r.setAttribute("y", (a.y - 0.5).toFixed(2));
    r.setAttribute("width",  "1.2");
    r.setAttribute("height", "1.2");
    r.setAttribute("fill", role.color);
    if (a.status === "running") r.setAttribute("stroke", "#ffffffaa");
    svg.appendChild(r);
  }
}

function svgEl(name) { return document.createElementNS("http://www.w3.org/2000/svg", name); }

// ───────────────────────────── Stage hint ─────────────────────────────

function updateStageHint(agents) {
  stageHint.hidden = agents.length > 0;
}

// ───────────────────────────── Agent panel ─────────────────────────────

function renderAgentPanel(agents) {
  const host = document.getElementById("panel-office");
  host.innerHTML = "";

  // Sticky head
  const head = el("div", "panel-head");
  head.innerHTML = `
    <h2 class="panel-title">
      <span>Live Agents</span>
      <span class="count-chip mono">${agents.length}</span>
    </h2>
    <div class="panel-filter">
      <button class="seg is-active">All</button>
      <button class="seg">Mine</button>
      <button class="seg">By role</button>
    </div>`;
  host.appendChild(head);

  if (agents.length === 0) {
    const empty = el("div", "panel-footer");
    empty.innerHTML = `<p class="muted-tiny">
      Start a Claude Code session in your terminal, IDE, or desktop app.
      Connected sessions appear here automatically.
    </p>`;
    host.appendChild(empty);
    return;
  }

  const running = agents.filter(a => a.status === "running");
  const idle    = agents.filter(a => a.status === "idle");
  const done    = agents.filter(a => a.status === "done");

  const groups = [
    { label: "Running", dot: "green pulse", rows: running },
    { label: "Idle",    dot: "amber",       rows: idle    }
  ];
  if (done.length) groups.push({ label: "Done", dot: "", rows: done });

  for (const g of groups) {
    const sec = el("div", "group");
    sec.innerHTML = `
      <div class="group-head">
        <span class="g-dot ${g.dot}"></span>
        <span class="g-label">${g.label}</span>
        <span class="g-count mono">${g.rows.length}</span>
      </div>`;
    for (const a of g.rows) sec.appendChild(renderRow(a));
    host.appendChild(sec);
  }

  const foot = el("div", "panel-footer");
  foot.innerHTML = `<p class="muted-tiny">Click any agent to inspect their persona, skills, and recent activity.</p>`;
  host.appendChild(foot);
}

function renderRow(a) {
  const role = a.role ?? { label: "—", full: "—", color: "#888" };
  const expanded = a.id === expandedAgentId;
  const card = el("div", `agent-card ${expanded ? "is-expanded" : ""} ${a.status === "done" ? "is-done" : ""}`);
  card.dataset.agentId = a.id;

  const row = el("div", "agent-row");
  row.innerHTML = `
    <div class="agent-avatar">
      <canvas width="32" height="44"></canvas>
      <span class="status-pip ${a.status}"></span>
    </div>
    <div class="agent-meta">
      <div class="name-row">
        <span class="agent-name" title="${esc(a.name)}">${esc(a.name)}</span>
        <span class="badge role" style="background:${role.color}">${role.label}</span>
      </div>
      <div class="activity-row">
        ${workIndicator(a)}
        <span class="activity-verb">${esc(a.activity.verb)}</span>
        ${a.activity.tool ? `<span class="activity-tool mono">${esc(a.activity.tool)}</span>` : ""}
        ${a.activity.target ? `<span class="activity-target mono">${esc(a.activity.target)}</span>` : ""}
      </div>
      <div class="meta-row mono">
        <span>${a.status === "done" ? "ended" : formatElapsed(a.elapsedMs)}</span>
        <span class="meta-dot">·</span>
        <span>${a.toolCount} tools</span>
        ${a.status === "running" && a.zone ? `<span class="meta-dot">·</span><span class="zone-tag">${a.zone}</span>` : ""}
      </div>
    </div>
    <button class="row-action" title="${a.status === 'done' ? 'Replay' : 'Stop'}">${a.status === "done" ? "↻" : "■"}</button>`;

  // Paint the avatar
  const av = row.querySelector("canvas");
  const avCtx = av.getContext("2d");
  avCtx.imageSmoothingEnabled = false;
  drawCharacter(avCtx, 0, 0, 2, a.customization, "idle", 1);

  // Click handlers
  row.addEventListener("click", () => {
    expandedAgentId = (expandedAgentId === a.id) ? null : a.id;
    refreshAll();
  });
  row.querySelector(".row-action").addEventListener("click", (e) => {
    e.stopPropagation();
    if (a.status !== "done") bridge.stopSession(a.id);
  });

  card.appendChild(row);
  if (expanded) card.appendChild(renderDetail(a, role));
  return card;
}

function renderDetail(a, role) {
  const detail = el("div", "agent-detail");
  const session = String(a.id).slice(0, 8);
  detail.innerHTML = `
    <div class="detail-grid">
      <div class="dk">ROLE</div>
      <div class="dv">${esc(role.full ?? role.label ?? "—")}</div>
      ${a.cwd ? `<div class="dk">CWD</div><div class="dv mono" title="${esc(a.cwd)}">${esc(shortenPath(a.cwd))}</div>` : ""}
      <div class="dk">STATUS</div>
      <div class="dv">
        <span class="badge live ${a.status}">${a.status.toUpperCase()}</span>
        <span class="mono dim"> · ${esc(a.activity.verb)} · ${formatElapsed(a.elapsedMs)} · ${a.toolCount} tool calls</span>
      </div>
      <div class="dk">SESSION</div>
      <div class="dv mono">${esc(session)}</div>
    </div>

    ${a.persona ? `
      <div class="detail-eyebrow eyebrow">PERSONA / CURRENT BRIEF</div>
      <div class="persona-box mono">${esc(a.persona)}</div>` : ""}

    <div class="detail-eyebrow eyebrow">SKILLS USED</div>
    <div class="skill-list">${skillBars(a.toolHistogram)}</div>

    <div class="detail-actions">
      <button class="btn small" data-action="customize">Customize avatar</button>
      <button class="btn small ghost" data-action="locate">Locate in office</button>
    </div>`;

  detail.querySelector('[data-action="customize"]')?.addEventListener("click", () => {
    document.querySelector('.tab[data-tab="avatar"]').click();
    setTimeout(() => {
      const sel = document.querySelector("#avatar-target");
      if (sel) { sel.value = a.id; sel.dispatchEvent(new Event("change")); }
    }, 50);
  });
  detail.querySelector('[data-action="locate"]')?.addEventListener("click", () => {
    const c = renderer.getCharacter(a.id);
    if (!c) return;
    renderer.say(a.id, "here!", { kind: "speech", ttl: 2000 });
  });

  return detail;
}

function skillBars(histogram) {
  const entries = Object.entries(histogram ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (entries.length === 0) return `<div class="muted-tiny">No tool calls yet.</div>`;
  const max = entries[0][1];
  return entries.map(([tool, count]) => `
    <div class="skill-row">
      <span class="skill-name">${esc(tool)}</span>
      <span class="skill-bar"><span class="skill-fill" style="width:${(count / max) * 100}%"></span></span>
      <span class="skill-count mono">${count}</span>
    </div>`).join("");
}

// ───────────────────────────── Activity ticker ─────────────────────────────

function onBridgeEvent(e) {
  const ev = e.detail;
  if (!ev || !ev.type) return;
  const agentName = renderer.getCharacter(ev.sessionId)?.name ?? deriveAgentName(ev);
  const agentRole = roleForName(agentName);
  const chip = {
    t:      relTime(ev.ts ?? Date.now()),
    agent:  shortAgent(agentName),
    roleColor: agentRole?.color ?? "#888",
    type:   tickerKind(ev.type, ev.tool_name),
    tool:   ev.tool_name ?? null,
    target: tickerTarget(ev)
  };
  tickerBuffer.unshift(chip);
  if (tickerBuffer.length > 50) tickerBuffer.pop();
  renderTicker();
}

function deriveAgentName(ev) {
  if (ev.agent_name) return ev.agent_name;
  if (ev.cwd) {
    const parts = String(ev.cwd).split("/").filter(Boolean);
    if (parts.length) return parts.at(-1);
  }
  return ev.sessionId?.slice(0, 6) ?? "agent";
}
function shortAgent(name) {
  return String(name).length > 22 ? String(name).slice(0, 21) + "…" : name;
}
function tickerTarget(ev) {
  if (ev.type === "pre_tool_use") {
    const t = ev.tool_input ?? {};
    return shortenPath(t.file_path ?? t.command ?? t.pattern ?? t.url ?? t.query ?? "");
  }
  if (ev.type === "assistant_msg") return short(ev.text, 40);
  if (ev.type === "thinking")      return short(ev.text, 40);
  if (ev.type === "user_prompt")   return short(ev.prompt, 40);
  return "";
}

function renderTicker() {
  const rail = document.getElementById("ticker-rail");
  rail.querySelectorAll(".ev-chip").forEach(n => n.remove());
  // Keep the marker at index 0 — insert chips AFTER it.
  const marker = rail.querySelector(".ticker-now-marker");
  for (const ev of tickerBuffer) {
    const chip = el("div", `ev-chip k-${ev.type}`);
    chip.innerHTML = `
      <span class="ev-time mono">${esc(ev.t)}</span>
      <span class="ev-dot" style="background:${ev.roleColor}"></span>
      <span class="ev-agent">${esc(ev.agent)}</span>
      <span class="ev-kind">${kindLabel(ev.type)}</span>
      ${ev.tool   ? `<span class="ev-tool mono">${esc(ev.tool)}</span>`     : ""}
      ${ev.target ? `<span class="ev-target mono">${esc(ev.target)}</span>` : ""}`;
    marker.after(chip);
  }
  setText("ticker-events", tickerBuffer.length);
  const oneMinAgo = Date.now() - 60_000;
  const last = tickerBuffer.filter(c => parseRelTime(c.t) > oneMinAgo).length;
  setText("ticker-last-min", last);
}

function setupTickerFilters() {
  document.querySelectorAll(".ticker-filter .seg").forEach(b => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".ticker-filter .seg").forEach(s => s.classList.toggle("is-active", s === b));
      const f = b.dataset.filter;
      document.querySelectorAll("#ticker-rail .ev-chip").forEach(chip => {
        const k = [...chip.classList].find(c => c.startsWith("k-"))?.slice(2);
        const show = f === "all"
          || (f === "tools" && (k === "pre" || k === "post" || k === "task"))
          || (f === "chat"  && (k === "say" || k === "think"));
        chip.style.display = show ? "" : "none";
      });
    });
  });
}

function relTime(ts) {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
function parseRelTime(s) {
  const [h, m, sec] = s.split(":").map(Number);
  const d = new Date(); d.setHours(h, m, sec, 0);
  return d.getTime();
}

// ───────────────────────────── Avatars panel ─────────────────────────────

function buildAvatarPanel() {
  const host = document.getElementById("panel-avatar");
  host.innerHTML = `
    <div class="sp-head">
      <h2 class="pixel-font sp-title">Customize Avatar</h2>
      <p class="muted-tiny">
        Each Claude Code session gets a pixel character. Pick a look and name;
        it'll persist across runs.
      </p>
    </div>

    <label class="field">
      <span class="eyebrow">Agent</span>
      <select id="avatar-target"></select>
    </label>

    <label class="field">
      <span class="eyebrow">Name</span>
      <input id="avatar-name" type="text" maxlength="48" />
    </label>

    <div class="avatar-preview-box">
      <canvas id="avatar-preview" width="96" height="144"></canvas>
      <div class="preview-meta">
        <span class="badge role" id="avatar-preview-role" style="background:#a48cff">—</span>
        <div class="preview-name" id="avatar-preview-name">—</div>
        <div class="preview-sub muted-tiny" id="avatar-preview-sub">—</div>
      </div>
    </div>

    <div class="swatch-group">
      <span class="eyebrow">Skin</span>
      <div id="swatch-skin" class="swatch-row"></div>
    </div>
    <div class="swatch-group">
      <span class="eyebrow">Hair color</span>
      <div id="swatch-hair-color" class="swatch-row"></div>
    </div>
    <div class="swatch-group">
      <span class="eyebrow">Hair style</span>
      <div id="swatch-hair-style" class="pill-row"></div>
    </div>
    <div class="swatch-group">
      <span class="eyebrow">Outfit</span>
      <div id="swatch-outfit" class="swatch-row"></div>
    </div>
    <div class="swatch-group">
      <span class="eyebrow">Accessory</span>
      <div id="swatch-accessory" class="pill-row"></div>
    </div>
    <div class="swatch-group">
      <span class="eyebrow">Accessory color</span>
      <div id="swatch-accessory-color" class="swatch-row"></div>
    </div>

    <div class="row-actions">
      <button id="avatar-randomize" class="btn">🎲 Randomize</button>
      <button id="avatar-save" class="btn primary">Save</button>
    </div>
  `;

  avatarEditor = new AvatarEditor(host, {
    onChange: ({ customization, name }) => {
      const sessionId = host.querySelector("#avatar-target").value;
      if (!sessionId) return;
      const c = renderer.getCharacter(sessionId);
      if (c) {
        c.customization = customization;
        if (name) c.name = name;
      }
      updateAvatarPreviewMeta(name, customization);
    }
  });

  host.querySelector("#avatar-save").addEventListener("click", async () => {
    const sessionId = host.querySelector("#avatar-target").value;
    if (!sessionId) return;
    const c = renderer.getCharacter(sessionId);
    if (!c) return;
    await upsertAgent(sessionId, { name: c.name, customization: c.customization });
  });

  host.querySelector("#avatar-target").addEventListener("change", () => {
    const sessionId = host.querySelector("#avatar-target").value;
    const c = renderer.getCharacter(sessionId);
    if (!c) return;
    avatarEditor.setCustomization(c.customization, c.name);
    updateAvatarPreviewMeta(c.name, c.customization);
  });

  setInterval(refreshAvatarTargetSelect, 1500);
}

function refreshAvatarTargetSelect() {
  const sel = document.querySelector("#avatar-target");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = "";
  const opts = [...renderer.characters.values()];
  if (opts.length === 0) {
    const o = document.createElement("option");
    o.value = ""; o.textContent = "(no agents — start a session or load demo)";
    sel.appendChild(o); return;
  }
  for (const c of opts) {
    const r = c.role ?? roleForName(c.name);
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = r ? `${c.name} — ${r.label}` : c.name;
    sel.appendChild(o);
  }
  if (current && [...sel.options].some(o => o.value === current)) sel.value = current;
  else sel.dispatchEvent(new Event("change"));
}

function updateAvatarPreviewMeta(name, customization) {
  const role = roleForName(name) ?? { label: "—", full: "—", color: "#888" };
  const r = document.getElementById("avatar-preview-role");
  const n = document.getElementById("avatar-preview-name");
  const s = document.getElementById("avatar-preview-sub");
  if (r) { r.textContent = role.label; r.style.background = role.color; }
  if (n) n.textContent = name?.split(/[\+\s]/)[0] ?? "—";
  if (s) s.textContent = role.full ?? "";
}

// ───────────────────────────── Layout panel ─────────────────────────────

function buildLayoutPanel() {
  const host = document.getElementById("panel-layout");
  host.innerHTML = `
    <div class="sp-head">
      <h2 class="pixel-font sp-title">Office Layout</h2>
      <p class="muted-tiny">Pick a tool, then click on the office to place. Right-click to remove.</p>
    </div>

    <div class="layout-mode-bar">
      <button class="seg is-active">Place</button>
      <button class="seg">Erase</button>
      <button class="seg">Pick</button>
    </div>

    <div class="eyebrow grp-label">Furniture</div>
    <div class="tool-grid" id="tool-row"></div>

    <div class="eyebrow grp-label">Terrain</div>
    <div class="tool-grid" id="terrain-row"></div>

    <div class="layout-help">
      <div class="lh-row"><kbd>Click</kbd><span class="lh-text">place</span></div>
      <div class="lh-row"><kbd>Right-click</kbd><span class="lh-text">erase tile</span></div>
      <div class="lh-row"><kbd>Esc</kbd><span class="lh-text">cancel</span></div>
    </div>

    <div class="row-actions">
      <button id="layout-reset" class="btn">Reset to default</button>
      <button id="layout-clear" class="btn warn">Clear all</button>
    </div>`;

  layoutEditor = new LayoutEditor({
    root: host, canvas, renderer,
    getMap: () => state.map,
    setMap: async (map) => {
      state.map = map;
      renderer.setMap(map);
      await saveMap(map);
    }
  });
}

// ───────────────────────────── Connection panel ─────────────────────────────

function setupBridgePanel() { /* built in buildBridgePanel; keep symmetric */ }

function buildBridgePanel() {
  const host = document.getElementById("panel-bridge");
  host.innerHTML = `
    <div class="sp-head">
      <h2 class="pixel-font sp-title">Bridge Connection</h2>
      <p class="muted-tiny">The local bridge receives Claude Code hook events and forwards them to this extension over WebSocket.</p>
    </div>

    <div class="bridge-status pixel-surface-deep" id="bridge-status-card">
      <div class="bs-left">
        <div class="bs-pulse" id="bs-pulse"><span class="dot green pulse"></span></div>
        <div>
          <div class="bs-title" id="bs-title">Connecting…</div>
          <div class="bs-sub mono" id="bs-sub">—</div>
        </div>
      </div>
      <div class="bs-right mono">
        <div class="bs-stat"><span class="dim">latency</span> <span id="bs-latency">—</span></div>
        <div class="bs-stat"><span class="dim">uptime</span> <span id="bs-uptime">—</span></div>
      </div>
    </div>

    <label class="field">
      <span class="eyebrow">Bridge URL</span>
      <input id="bridge-url" type="text" placeholder="ws://127.0.0.1:9876/ws" />
    </label>
    <div class="row-actions">
      <button id="bridge-save" class="btn primary">Save &amp; reconnect</button>
      <button id="bridge-reconnect" class="btn">Reconnect</button>
    </div>

    <div class="hooks-block">
      <div class="hooks-head">
        <span class="eyebrow">Claude Code hooks</span>
        <span class="badge outline" id="hooks-badge">CHECKING…</span>
      </div>
      <div class="hooks-list" id="hooks-list">
        <div class="hook-row"><span class="dot"></span><span class="hook-name">UserPromptSubmit</span><span class="hook-desc">fires when you submit a prompt</span></div>
        <div class="hook-row"><span class="dot"></span><span class="hook-name">PreToolUse</span><span class="hook-desc">fires before each tool call</span></div>
        <div class="hook-row"><span class="dot"></span><span class="hook-name">PostToolUse</span><span class="hook-desc">fires after each tool call</span></div>
        <div class="hook-row"><span class="dot"></span><span class="hook-name">Stop</span><span class="hook-desc">fires when an agent stops</span></div>
        <div class="hook-row"><span class="dot"></span><span class="hook-name">SessionEnd</span><span class="hook-desc">fires when the session ends</span></div>
      </div>
      <div class="row-actions" id="hooks-actions"></div>
      <p class="muted-tiny">
        One click adds <code>notify.sh</code> to <code>~/.claude/settings.json</code> for every Claude Code event we visualize.
        Your existing hooks are preserved; the file is backed up before any change.
      </p>
    </div>

    <div class="demo-block">
      <span class="eyebrow">Demo</span>
      <div class="row-actions">
        <button id="demo-run"  class="btn">▶ Run demo session</button>
        <button id="demo-stop" class="btn ghost">■ Stop demo</button>
      </div>
    </div>`;

  // Wire actions
  host.querySelector("#bridge-url").value = state.bridgeUrl;
  host.querySelector("#bridge-save").addEventListener("click", async () => {
    const url = host.querySelector("#bridge-url").value.trim() || "ws://127.0.0.1:9876/ws";
    await setBridgeUrl(url);
    bridge.setBridgeUrl(url);
  });
  host.querySelector("#bridge-reconnect").addEventListener("click", () => bridge.reconnect());
  host.querySelector("#demo-run").addEventListener("click", () => runDemo(ev => bridge.handleEvent(ev)));
  host.querySelector("#demo-stop").addEventListener("click", () => stopDemo());

  refreshHookStatus();
  setInterval(refreshHookStatus, 5000);
}

function bridgeHttpBase() {
  const ws = state.bridgeUrl || "ws://127.0.0.1:9876/ws";
  return ws.replace(/^ws:/, "http:").replace(/^wss:/, "https:").replace(/\/ws\/?$/, "");
}

async function refreshHookStatus() {
  const badge = document.getElementById("hooks-badge");
  const list  = document.getElementById("hooks-list");
  const actions = document.getElementById("hooks-actions");
  if (!badge || !list) return;
  try {
    const resp = await fetch(`${bridgeHttpBase()}/hook-status`);
    const data = await resp.json();
    const all = data.installed;
    badge.classList.remove("outline");
    badge.classList.add(all ? "live" : "outline");
    badge.textContent = all ? "INSTALLED" : "NOT INSTALLED";

    [...list.children].forEach((row) => {
      const name = row.querySelector(".hook-name")?.textContent;
      const on = data.per_event?.[name];
      const dot = row.querySelector(".dot");
      dot.classList.remove("green", "red");
      dot.classList.add(on ? "green" : "red");
    });

    actions.innerHTML = all
      ? `<button class="btn" id="hooks-refresh">Refresh</button>
         <button class="btn ghost" id="hooks-uninstall">Uninstall</button>`
      : `<button class="btn primary" id="hooks-install">Install hooks automatically</button>
         <button class="btn" id="hooks-refresh">Refresh</button>`;
    actions.querySelector("#hooks-install")?.addEventListener("click", async () => {
      if (!confirm("This will modify ~/.claude/settings.json (with a timestamped backup). Continue?")) return;
      await hookAction("install-hooks");
    });
    actions.querySelector("#hooks-uninstall")?.addEventListener("click", async () => {
      if (!confirm("Remove the pixel-agent hook entries from ~/.claude/settings.json?")) return;
      await hookAction("uninstall-hooks");
    });
    actions.querySelector("#hooks-refresh")?.addEventListener("click", refreshHookStatus);
  } catch {
    badge.textContent = "BRIDGE OFFLINE";
    badge.classList.add("outline");
    actions.innerHTML = `<button class="btn ghost" disabled>Bridge unreachable</button>`;
  }
}

async function hookAction(path) {
  try {
    const resp = await fetch(`${bridgeHttpBase()}/${path}`, { method: "POST" });
    if (!resp.ok) throw new Error(`${resp.status}`);
    await refreshHookStatus();
  } catch (err) {
    alert("Hook action failed: " + err.message);
  }
}

let bridgeStartedAt = null;
function paintBridgeStatusCard(connected, url) {
  const pulse = document.getElementById("bs-pulse");
  const title = document.getElementById("bs-title");
  const sub   = document.getElementById("bs-sub");
  const upt   = document.getElementById("bs-uptime");
  const lat   = document.getElementById("bs-latency");
  if (!title) return;
  if (connected) {
    pulse?.classList.remove("off");
    title.classList.remove("off");
    title.textContent = "Connected";
    if (!bridgeStartedAt) bridgeStartedAt = Date.now();
    if (lat) lat.textContent = "—";
  } else {
    pulse?.classList.add("off");
    title.classList.add("off");
    title.textContent = "Disconnected";
    bridgeStartedAt = null;
    if (lat) lat.textContent = "—";
    if (upt) upt.textContent = "—";
  }
  if (sub) sub.textContent = url || "—";
}
setInterval(() => {
  const upt = document.getElementById("bs-uptime");
  if (upt && bridgeStartedAt) upt.textContent = formatElapsed(Date.now() - bridgeStartedAt);
}, 1000);

// ───────────────────────────── helpers ─────────────────────────────

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function setText(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function shortenPath(p) {
  if (!p) return "";
  const parts = String(p).split("/").filter(Boolean);
  if (parts.length <= 3) return p;
  return ".../" + parts.slice(-2).join("/");
}
function short(s, n) {
  s = String(s ?? "").trim().replace(/\s+/g, " ");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

init();
