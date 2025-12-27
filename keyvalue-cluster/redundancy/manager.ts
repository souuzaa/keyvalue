import path from "path";

const managerPort = process.env.PORT ? Number(process.env.PORT) : 3000;
const baseDir = process.cwd();
const replicaCount = 3;
const replicaPorts = Array.from({ length: replicaCount }, (_, i) => 3001 + i);
const replicas = replicaPorts.map((port, index) => ({
  id: `replica-${index + 1}`,
  port,
  url: `http://localhost:${port}`,
  dataDir: path.join(baseDir, "data", `replica-${index + 1}`)
}));

type ReplicaProcess = {
  info: (typeof replicas)[number];
  proc: ReturnType<typeof Bun.spawn>;
};

const running = new Map<string, ReplicaProcess>();
let rrIndex = 0;
let masterId: string | null = null;
let clusterSnapshot: Array<Record<string, unknown>> = [];

function spawnReplica(info: (typeof replicas)[number]) {
  const proc = Bun.spawn({
    cmd: ["bun", "server.ts"],
    cwd: baseDir,
    env: {
      ...Bun.env,
      PORT: info.port.toString(),
      KV_DATA_DIR: info.dataDir
    },
    stdout: "inherit",
    stderr: "inherit"
  });

  running.set(info.id, { info, proc });

  proc.exited.then((code) => {
    running.delete(info.id);
    console.warn(`${info.id} exited with code ${code}. Restarting...`);
    setTimeout(() => spawnReplica(info), 500);
  });
}

for (const info of replicas) {
  spawnReplica(info);
}

async function proxyRequest(req: Request, target: string, body?: ArrayBuffer) {
  const url = new URL(req.url);
  url.host = target.replace(/^https?:\/\//, "");
  const headers = new Headers(req.headers);
  headers.delete("host");
  return fetch(url, {
    method: req.method,
    headers,
    body
  });
}

function pickRoundRobin(options: typeof replicas) {
  rrIndex = (rrIndex + 1) % options.length;
  return options[rrIndex];
}

function getHealthyReplicas() {
  return clusterSnapshot
    .filter((item) => item.ok)
    .map((item) =>
      replicas.find((replica) => replica.id === item.id)
    )
    .filter(Boolean) as typeof replicas;
}

function selectMaster() {
  const healthy = getHealthyReplicas();
  if (!healthy.length) {
    masterId = null;
    return;
  }
  const sorted = [...healthy].sort((a, b) => a.port - b.port);
  const newMaster = sorted[0].id;
  if (newMaster !== masterId) {
    console.log(`Master elected: ${newMaster}`);
  }
  masterId = newMaster;
}

function pickReadReplica() {
  const healthy = getHealthyReplicas();
  const slaves = healthy.filter((replica) => replica.id !== masterId);
  if (slaves.length) {
    return pickRoundRobin(slaves);
  }
  if (healthy.length) {
    return pickRoundRobin(healthy);
  }
  return replicas[0];
}

function getMasterReplica() {
  return replicas.find((replica) => replica.id === masterId) ?? null;
}

async function fanoutRequest(req: Request) {
  const body = await req.arrayBuffer();
  const master = getMasterReplica();
  const targets = master ? [master] : replicas;
  const responses = await Promise.allSettled(
    targets.map((replica) => proxyRequest(req, replica.url, body))
  );
  const ok = responses.find(
    (result): result is PromiseFulfilledResult<Response> =>
      result.status === "fulfilled" && result.value.ok
  );
  if (ok) {
    return ok.value;
  }
  const first = responses.find(
    (result): result is PromiseFulfilledResult<Response> =>
      result.status === "fulfilled"
  );
  return first?.value ?? new Response("All replicas unavailable", { status: 503 });
}

async function syncCluster() {
  const results = await Promise.allSettled(
    replicas.map(async (replica) => {
      const startedAt = Date.now();
      try {
        const res = await fetch(`${replica.url}/api/stats`);
        const body = await res.json();
        return {
          id: replica.id,
          port: replica.port,
          ok: res.ok,
          latencyMs: Date.now() - startedAt,
          stats: body.data ?? null
        };
      } catch (error) {
        return {
          id: replica.id,
          port: replica.port,
          ok: false,
          latencyMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : "unknown error"
        };
      }
    })
  );

  clusterSnapshot = results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      id: replicas[index].id,
      port: replicas[index].port,
      ok: false,
      latencyMs: null,
      error: "unknown error"
    };
  });

  selectMaster();
}

async function replicateFromMaster() {
  const master = getMasterReplica();
  if (!master) {
    return;
  }
  try {
    const res = await fetch(`${master.url}/api/kv`);
    if (!res.ok) {
      return;
    }
    const body = await res.json();
    const data = body.data ?? {};
    const slaves = replicas.filter((replica) => replica.id !== master.id);
    await Promise.allSettled(
      slaves.map((replica) =>
        fetch(`${replica.url}/api/replicate`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data })
        })
      )
    );
  } catch {
    return;
  }
}

await syncCluster();
setInterval(syncCluster, 2000);
setInterval(replicateFromMaster, 2000);

const server = Bun.serve({
  port: managerPort,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws" && server.upgrade(req)) {
      return;
    }

    if (url.pathname === "/api/cluster" && req.method === "GET") {
      const data = clusterSnapshot.map((item) => ({
        ...item,
        isMaster: item.id === masterId
      }));

      return new Response(JSON.stringify({ data, masterId }), {
        headers: { "content-type": "application/json" }
      });
    }

    if (req.method === "PUT" || req.method === "DELETE") {
      return fanoutRequest(req);
    }

    const replica = pickReadReplica();
    return proxyRequest(req, replica.url);
  },
  websocket: {
    open(ws) {
      const master = getMasterReplica();
      const target = master ?? replicas[0];
      const backend = new WebSocket(`${target.url.replace("http", "ws")}/ws`);
      ws.data = { backend };

      backend.addEventListener("message", (event) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(event.data);
        }
      });

      backend.addEventListener("close", () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1011, "Backend disconnected");
        }
      });
    },
    message(ws, message) {
      const backend: WebSocket | undefined = ws.data?.backend;
      if (backend && backend.readyState === WebSocket.OPEN) {
        backend.send(message);
      }
    },
    close(ws) {
      const backend: WebSocket | undefined = ws.data?.backend;
      if (backend && backend.readyState === WebSocket.OPEN) {
        backend.close();
      }
    }
  }
});

function shutdown() {
  for (const { proc } of running.values()) {
    proc.kill();
  }
  server.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Redundancy manager running on http://localhost:${managerPort}`);
