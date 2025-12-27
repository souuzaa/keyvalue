const form = document.getElementById("kv-form");
const listEl = document.getElementById("kv-list");
const template = document.getElementById("row-template");
const deleteBtn = document.getElementById("delete-btn");
const refreshBtn = document.getElementById("refresh-btn");
const filterInput = document.getElementById("filter");
const emptyState = document.getElementById("empty-state");
const wsIndicator = document.getElementById("ws-indicator");
const wsLabel = document.getElementById("ws-label");
const editorHint = document.getElementById("editor-hint");
const statTotalKeys = document.getElementById("stat-total-keys");
const statVisibleKeys = document.getElementById("stat-visible-keys");
const statTotalSize = document.getElementById("stat-total-size");
const statAvgSize = document.getElementById("stat-avg-size");
const statLargest = document.getElementById("stat-largest");
const statUpdated = document.getElementById("stat-updated");
const timelineArea = document.getElementById("timeline-area");
const timelineLine = document.getElementById("timeline-line");

let store = {};
let selectedKey = "";
let lastUpdated = null;
const timeline = [];
const TIMELINE_MAX = 40;
const TIMELINE_WIDTH = 640;
const TIMELINE_HEIGHT = 180;
const TIMELINE_PADDING = 20;

function prettyValue(value) {
  return JSON.stringify(value, null, 2);
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function updateStats(visibleCount) {
  const entries = Object.entries(store);
  const totalKeys = entries.length;
  let totalValueBytes = 0;
  let largest = { key: "", size: 0 };

  for (const [key, value] of entries) {
    const size = JSON.stringify(value).length;
    totalValueBytes += size;
    if (size > largest.size) {
      largest = { key, size };
    }
  }

  const avgValueBytes = totalKeys ? Math.round(totalValueBytes / totalKeys) : 0;
  const updatedLabel = lastUpdated ? lastUpdated.toLocaleTimeString() : "—";
  const largestLabel = largest.size
    ? `${largest.key} (${formatBytes(largest.size)})`
    : "—";

  statTotalKeys.textContent = totalKeys.toString();
  statVisibleKeys.textContent = visibleCount.toString();
  statTotalSize.textContent = formatBytes(totalValueBytes);
  statAvgSize.textContent = formatBytes(avgValueBytes);
  statLargest.textContent = largestLabel;
  statUpdated.textContent = updatedLabel;
}

function recordTimelinePoint(count) {
  const last = timeline[timeline.length - 1];
  if (last && last.count === count) {
    return;
  }
  timeline.push({ count, time: Date.now() });
  if (timeline.length > TIMELINE_MAX) {
    timeline.shift();
  }
}

function updateTimeline() {
  if (!timelineArea || !timelineLine) {
    return;
  }
  if (!timeline.length) {
    timelineArea.setAttribute("d", "");
    timelineLine.setAttribute("d", "");
    return;
  }

  const counts = timeline.map((point) => point.count);
  const maxCount = Math.max(1, ...counts);
  const width = TIMELINE_WIDTH - TIMELINE_PADDING * 2;
  const height = TIMELINE_HEIGHT - TIMELINE_PADDING * 2;
  const stepX = timeline.length > 1 ? width / (timeline.length - 1) : 0;

  const points = timeline.map((point, index) => {
    const x = TIMELINE_PADDING + index * stepX;
    const y =
      TIMELINE_PADDING + height - (point.count / maxCount) * height;
    return [x, y];
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point[0]} ${point[1]}`)
    .join(" ");
  const areaPath = `${linePath} L ${
    TIMELINE_PADDING + width
  } ${TIMELINE_PADDING + height} L ${TIMELINE_PADDING} ${
    TIMELINE_PADDING + height
  } Z`;

  timelineLine.setAttribute("d", linePath);
  timelineArea.setAttribute("d", areaPath);
}

function renderList() {
  const filter = filterInput.value.trim().toLowerCase();
  listEl.innerHTML = "";

  const entries = Object.entries(store)
    .filter(([key]) => key.toLowerCase().includes(filter))
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [key, value] of entries) {
    const row = template.content.cloneNode(true);
    row.querySelector(".kv-key").textContent = key;
    row.querySelector(".kv-value").textContent = prettyValue(value);
    row.querySelector("button").addEventListener("click", () => loadKey(key));
    listEl.appendChild(row);
  }

  emptyState.style.display = entries.length ? "none" : "block";
  updateStats(entries.length);
  recordTimelinePoint(Object.keys(store).length);
  updateTimeline();
}

async function fetchStore() {
  const res = await fetch("/api/kv");
  const body = await res.json();
  store = body.data || {};
  lastUpdated = new Date();
  renderList();
}

function loadKey(key) {
  selectedKey = key;
  form.key.value = key;
  form.value.value = prettyValue(store[key]);
  editorHint.textContent = `Loaded ${key}. Edit the JSON value and save.`;
}

function clearEditor() {
  selectedKey = "";
  form.key.value = "";
  form.value.value = "";
  editorHint.textContent = "Try selecting a key from the list.";
}

async function saveKey(event) {
  event.preventDefault();
  const key = form.key.value.trim();
  if (!key) {
    return;
  }

  let value;
  const raw = form.value.value.trim();
  try {
    value = raw ? JSON.parse(raw) : "";
  } catch {
    alert("Value must be valid JSON.");
    return;
  }

  await fetch(`/api/kv/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value })
  });
  clearEditor();
}

async function deleteKey() {
  const key = form.key.value.trim();
  if (!key) {
    alert("Enter a key to delete.");
    return;
  }

  await fetch(`/api/kv/${encodeURIComponent(key)}`, { method: "DELETE" });
  clearEditor();
}

function connectWs() {
  const ws = new WebSocket(`${location.origin.replace("http", "ws")}/ws`);

  ws.addEventListener("open", () => {
    wsIndicator.classList.add("ready");
    wsLabel.textContent = "Live updates connected";
  });

  ws.addEventListener("close", () => {
    wsIndicator.classList.remove("ready");
    wsLabel.textContent = "Disconnected. Reconnecting...";
    setTimeout(connectWs, 1000);
  });

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "snapshot") {
      store = message.payload || {};
      lastUpdated = new Date();
      renderList();
      return;
    }

    if (message.type === "set") {
      store[message.payload.key] = message.payload.value;
      lastUpdated = new Date();
      renderList();
      return;
    }

    if (message.type === "delete") {
      delete store[message.payload.key];
      lastUpdated = new Date();
      renderList();
    }
  });
}

form.addEventListener("submit", saveKey);
deleteBtn.addEventListener("click", deleteKey);
refreshBtn.addEventListener("click", fetchStore);
filterInput.addEventListener("input", renderList);

fetchStore();
connectWs();
