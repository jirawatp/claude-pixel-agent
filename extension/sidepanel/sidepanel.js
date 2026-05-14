// Compact side panel — the same polish vocabulary as the dashboard, smaller.

import { OfficeRenderer } from "../src/renderer/canvas-renderer.js";
import { BridgeClient }   from "../src/bridge/client.js";
import { loadAll }        from "../src/state/store.js";
import { drawCharacter }  from "../src/renderer/sprite-factory.js";
import { roleForName }    from "../src/state/roles.js";
import { workIndicator }  from "../src/renderer/work-indicator.js";
import { runDemo }        from "../src/bridge/demo.js";

const canvas = document.getElementById("office");
const dot       = document.getElementById("status-dot");
const agentList = document.getElementById("agent-list");
const emptyHint = document.getElementById("empty-hint");

let renderer;
let bridge;

async function init() {
  const state = await loadAll();
  // Slightly smaller scale for the side panel
  renderer = new OfficeRenderer(canvas, { map: state.map, scale: 1 });
  renderer.start();

  bridge = new BridgeClient(renderer, {
    agentDefaults: state.agents,
    onStatus: (status) => {
      const connected = status === "connected";
      dot.classList.toggle("green", connected);
      dot.classList.toggle("red",   !connected);
    },
    onEvent: () => refresh()
  });
  bridge.connect();

  document.getElementById("open-dashboard")?.addEventListener("click", () => {
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
    } else {
      window.open("../dashboard/dashboard.html");
    }
  });
  document.getElementById("demo-btn")?.addEventListener("click", () => {
    runDemo((ev) => bridge.handleEvent(ev));
  });

  setInterval(refresh, 1000);
}

function refresh() {
  const chars = [...renderer.characters.values()];
  emptyHint.hidden = chars.length > 0;
  agentList.innerHTML = "";

  const running = chars.filter(c => !c.endedAt && (c.currentTool || c.state === "walking" || c.state === "thinking"));
  const idle    = chars.filter(c => !c.endedAt && !running.includes(c));
  const done    = chars.filter(c => c.endedAt);

  const groups = [
    { label: "Running", dot: "green pulse", rows: running },
    { label: "Idle",    dot: "amber",       rows: idle    }
  ];
  if (done.length) groups.push({ label: "Done", dot: "", rows: done });

  for (const g of groups) {
    if (!g.rows.length) continue;
    const head = document.createElement("li");
    head.className = "group-head";
    head.innerHTML = `<span class="g-dot ${g.dot}"></span><span class="g-label">${g.label}</span><span class="g-count mono">${g.rows.length}</span>`;
    agentList.appendChild(head);
    for (const c of g.rows) agentList.appendChild(renderRow(c, g.label === "Done" ? "done" : g.label === "Idle" ? "idle" : "running"));
  }
}

function renderRow(c, status) {
  const role = c.role ?? roleForName(c.name);
  const li = document.createElement("li");
  li.className = `sp-row ${status === "done" ? "is-done" : ""}`;

  const verb = c.currentTool
    ? (c.currentTool === "Bash" ? "Running shell" : c.currentTool === "Read" ? "Reading" : `Using ${c.currentTool}`)
    : (status === "idle" ? "Idle" : status === "done" ? "Done" : (c.activity ?? "Working"));
  const target = c.bubble?.text ?? "";

  li.innerHTML = `
    <div class="agent-avatar">
      <canvas width="22" height="33"></canvas>
      <span class="status-pip ${status}"></span>
    </div>
    <div class="meta">
      <div class="name-row">
        <span class="agent-name" title="${esc(c.name)}">${esc(c.name)}</span>
        ${role ? `<span class="badge role" style="background:${role.color}">${role.label}</span>` : ""}
      </div>
      <div class="activity-row">
        ${workIndicator({ state: c.state, currentTool: c.currentTool, endedAt: c.endedAt })}
        <span class="activity-verb">${esc(verb)}</span>
        ${target ? `<span class="activity-target">${esc(target)}</span>` : ""}
      </div>
    </div>
    <button class="row-action" title="${status === 'done' ? 'Replay' : 'Stop'}">${status === "done" ? "↻" : "■"}</button>`;

  const av = li.querySelector("canvas");
  const ctx = av.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  drawCharacter(ctx, 0, 0, 1.4, c.customization, "idle", 1);

  li.querySelector(".row-action").addEventListener("click", () => {
    if (status !== "done") bridge.stopSession(c.id);
  });
  return li;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

init();
