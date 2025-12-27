const replicaGrid = document.getElementById("replica-grid");
const template = document.getElementById("replica-template");
const refreshButton = document.getElementById("refresh-cluster");
const clusterHealthy = document.getElementById("cluster-healthy");
const clusterKeys = document.getElementById("cluster-keys");
const clusterSize = document.getElementById("cluster-size");
const clusterLatency = document.getElementById("cluster-latency");

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "—";
  }
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString();
}

function renderCluster(data) {
  replicaGrid.innerHTML = "";

  let healthyCount = 0;
  let totalKeys = 0;
  let totalBytes = 0;
  let totalLatency = 0;
  let latencyCount = 0;

  for (const replica of data) {
    const card = template.content.cloneNode(true);
    const label = card.querySelector(".replica-label");
    const title = card.querySelector(".replica-title");
    const pill = card.querySelector(".replica-pill");

    label.textContent = replica.id;
    title.textContent = `Port ${replica.port}`;

    if (replica.ok) {
      pill.textContent = "Healthy";
      pill.classList.remove("down");
      healthyCount += 1;
    } else {
      pill.textContent = "Down";
      pill.classList.add("down");
    }

    if (replica.isMaster) {
      pill.textContent = "Master";
    }

    const stats = replica.stats || {};
    card.querySelector(".replica-keys").textContent = replica.ok
      ? `${stats.totalKeys ?? 0}`
      : "—";
    card.querySelector(".replica-size").textContent = replica.ok
      ? formatBytes(stats.totalValueBytes ?? 0)
      : "—";
    card.querySelector(".replica-avg").textContent = replica.ok
      ? formatBytes(stats.averageValueBytes ?? 0)
      : "—";
    card.querySelector(".replica-largest").textContent = replica.ok
      ? stats.largestKey || "—"
      : "—";
    card.querySelector(".replica-latency").textContent =
      replica.latencyMs != null ? `${replica.latencyMs} ms` : "—";
    card.querySelector(".replica-updated").textContent = replica.ok
      ? formatTime(stats.lastUpdated)
      : "—";

    if (replica.ok) {
      totalKeys += stats.totalKeys ?? 0;
      totalBytes += stats.totalValueBytes ?? 0;
    }
    if (replica.latencyMs != null) {
      totalLatency += replica.latencyMs;
      latencyCount += 1;
    }

    replicaGrid.appendChild(card);
  }

  clusterHealthy.textContent = `${healthyCount}`;
  clusterKeys.textContent = `${totalKeys}`;
  clusterSize.textContent = formatBytes(totalBytes);
  clusterLatency.textContent = latencyCount
    ? `${Math.round(totalLatency / latencyCount)} ms`
    : "—";
}

async function fetchCluster() {
  try {
    const res = await fetch("/api/cluster");
    const body = await res.json();
    renderCluster(body.data || []);
  } catch {
    renderCluster([]);
  }
}

refreshButton.addEventListener("click", fetchCluster);

fetchCluster();
setInterval(fetchCluster, 4000);
