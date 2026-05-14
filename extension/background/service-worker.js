// Service worker — owns the WebSocket connection to the local bridge and
// fans events out to any open UI (side panel, dashboard tab).

const DEFAULT_BRIDGE_URL = "ws://127.0.0.1:9876/ws";
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

let ws = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let bridgeUrl = DEFAULT_BRIDGE_URL;
const ports = new Set();

async function loadConfig() {
  const { bridgeUrl: stored } = await chrome.storage.local.get("bridgeUrl");
  if (stored) bridgeUrl = stored;
}

function broadcast(message) {
  for (const port of ports) {
    try {
      port.postMessage(message);
    } catch (err) {
      // Port may be disconnected; ignore.
    }
  }
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    ws = new WebSocket(bridgeUrl);
  } catch (err) {
    scheduleReconnect();
    return;
  }

  ws.addEventListener("open", () => {
    reconnectAttempts = 0;
    broadcast({ type: "bridge_status", status: "connected", url: bridgeUrl });
  });

  ws.addEventListener("message", (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    broadcast({ type: "agent_event", event: payload });
  });

  ws.addEventListener("close", () => {
    broadcast({ type: "bridge_status", status: "disconnected", url: bridgeUrl });
    scheduleReconnect();
  });

  ws.addEventListener("error", () => {
    try { ws.close(); } catch {}
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS);
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "pixel-agent") return;
  ports.add(port);
  port.postMessage({
    type: "bridge_status",
    status: ws && ws.readyState === WebSocket.OPEN ? "connected" : "disconnected",
    url: bridgeUrl
  });
  port.onMessage.addListener((msg) => {
    if (msg?.type === "reconnect") {
      try { ws?.close(); } catch {}
      connect();
    }
    if (msg?.type === "set_bridge_url" && typeof msg.url === "string") {
      bridgeUrl = msg.url;
      chrome.storage.local.set({ bridgeUrl });
      try { ws?.close(); } catch {}
      connect();
    }
  });
  port.onDisconnect.addListener(() => ports.delete(port));
});

chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel?.open) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
      return;
    } catch {}
  }
  // Fallback: open the full dashboard in a new tab.
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
});

chrome.runtime.onInstalled.addListener(async () => {
  if (chrome.sidePanel?.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch {}
  }
});

(async () => {
  await loadConfig();
  connect();
})();
