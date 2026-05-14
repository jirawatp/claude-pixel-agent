// State store backed by chrome.storage.local.
//
// Persists:
//   - agents: { [sessionId]: { name, customization, lastSeen } }
//   - map:    tilemap object
//   - bridgeUrl
//
// Other modules subscribe to changes via subscribe().

import { defaultMap } from "../renderer/tilemap.js";
import { defaultCustomization } from "../renderer/sprite-factory.js";

const KEYS = {
  agents:    "agents",
  map:       "map",
  bridgeUrl: "bridgeUrl",
  ui:        "ui"
};

// Fallback in-memory storage for environments without chrome.storage
// (e.g. opening the dashboard HTML directly during dev/testing).
const memShim = {};
const storage = (typeof chrome !== "undefined" && chrome.storage?.local) ? chrome.storage.local : {
  async get(keys) {
    if (typeof keys === "string") return { [keys]: memShim[keys] };
    if (Array.isArray(keys)) return Object.fromEntries(keys.map((k) => [k, memShim[k]]));
    return { ...memShim };
  },
  async set(obj) { Object.assign(memShim, obj); }
};
const onChanged = (typeof chrome !== "undefined" && chrome.storage?.onChanged) ? chrome.storage.onChanged : { addListener() {} };

const listeners = new Set();

function emit() {
  for (const fn of listeners) {
    try { fn(); } catch (err) { console.error(err); }
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function loadAll() {
  const out = await storage.get(Object.values(KEYS));
  if (!out.map) out.map = defaultMap();
  if (!out.agents) out.agents = {};
  if (!out.bridgeUrl) out.bridgeUrl = "ws://127.0.0.1:9876/ws";
  if (!out.ui) out.ui = { scale: 3, showHints: true };
  return out;
}

export async function saveMap(map) {
  await storage.set({ [KEYS.map]: map });
  emit();
}

export async function saveAgents(agents) {
  await storage.set({ [KEYS.agents]: agents });
  emit();
}

export async function upsertAgent(sessionId, patch) {
  const { agents = {} } = await storage.get(KEYS.agents);
  const prev = agents[sessionId] ?? {
    name: patch.name ?? `agent-${sessionId.slice(0, 4)}`,
    customization: defaultCustomization(hashCode(sessionId)),
    lastSeen: Date.now()
  };
  agents[sessionId] = { ...prev, ...patch, lastSeen: Date.now() };
  await saveAgents(agents);
  return agents[sessionId];
}

export async function removeAgent(sessionId) {
  const { agents = {} } = await storage.get(KEYS.agents);
  delete agents[sessionId];
  await saveAgents(agents);
}

export async function setBridgeUrl(url) {
  await storage.set({ [KEYS.bridgeUrl]: url });
  emit();
}

export async function setUi(patch) {
  const { ui = {} } = await storage.get(KEYS.ui);
  await storage.set({ [KEYS.ui]: { ...ui, ...patch } });
  emit();
}

// Listen for any external storage changes (other tabs, options page).
onChanged.addListener((changes, area) => {
  if (area && area !== "local") return;
  if (Object.keys(changes ?? {}).some((k) => Object.values(KEYS).includes(k))) {
    emit();
  }
});

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
