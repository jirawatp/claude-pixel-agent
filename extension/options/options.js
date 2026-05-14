import { loadAll, setBridgeUrl } from "../src/state/store.js";

const urlInput = document.getElementById("bridge-url");
const savedEl = document.getElementById("saved");

(async () => {
  const state = await loadAll();
  urlInput.value = state.bridgeUrl;
})();

document.getElementById("save").addEventListener("click", async () => {
  const url = urlInput.value.trim() || "ws://127.0.0.1:9876/ws";
  await setBridgeUrl(url);
  // Ask the service worker to reconnect with the new URL.
  const port = chrome.runtime.connect({ name: "pixel-agent" });
  port.postMessage({ type: "set_bridge_url", url });
  setTimeout(() => port.disconnect(), 200);

  savedEl.hidden = false;
  setTimeout(() => { savedEl.hidden = true; }, 1500);
});

document.getElementById("open-dashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
});

document.getElementById("reset-data").addEventListener("click", async () => {
  if (!confirm("Reset all saved agents, avatars, and office layout?")) return;
  await chrome.storage.local.clear();
  alert("Cleared. Reopen the dashboard.");
});
