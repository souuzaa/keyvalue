import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const dataDir = process.env.KV_DATA_DIR ?? path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "kv.json");

type KVValue = unknown;

const kv: Record<string, KVValue> = {};
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const startedAt = new Date().toISOString();
let lastUpdated: string | null = null;

async function loadStore() {
  if (!existsSync(dataFile)) {
    return;
  }
  const raw = await readFile(dataFile, "utf8");
  if (!raw.trim()) {
    return;
  }
  const parsed = JSON.parse(raw) as Record<string, KVValue>;
  Object.assign(kv, parsed);
  lastUpdated = new Date().toISOString();
}

function scheduleSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(dataFile, JSON.stringify(kv, null, 2), "utf8");
  }, 150);
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {})
    }
  });
}

function computeStats() {
  const entries = Object.entries(kv);
  let totalValueBytes = 0;
  let largestValueBytes = 0;
  let largestKey = "";

  for (const [key, value] of entries) {
    const size = JSON.stringify(value).length;
    totalValueBytes += size;
    if (size > largestValueBytes) {
      largestValueBytes = size;
      largestKey = key;
    }
  }

  return {
    totalKeys: entries.length,
    totalValueBytes,
    averageValueBytes: entries.length
      ? Math.round(totalValueBytes / entries.length)
      : 0,
    largestKey,
    largestValueBytes,
    startedAt,
    lastUpdated
  };
}

const clients = new Set<WebSocket>();

function broadcast(message: Record<string, unknown>) {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

await loadStore();

const server = Bun.serve({
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws" && server.upgrade(req)) {
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      return handleApi(req, url);
    }

    if (url.pathname === "/") {
      return new Response(Bun.file("public/index.html"));
    }

    if (url.pathname === "/cluster") {
      return new Response(Bun.file("public/cluster.html"));
    }

    if (url.pathname.startsWith("/public/")) {
      return new Response(Bun.file(url.pathname.slice(1)));
    }

    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      ws.send(
        JSON.stringify({
          type: "snapshot",
          payload: kv
        })
      );
    },
    close(ws) {
      clients.delete(ws);
    }
  }
});

async function handleApi(req: Request, url: URL) {
  const pathParts = url.pathname.replace("/api/", "").split("/");

  if (pathParts[0] !== "kv") {
    if (pathParts[0] === "replicate" && req.method === "PUT") {
      let body: { data?: Record<string, KVValue> } = {};
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "invalid JSON body" }, { status: 400 });
      }

      if (!body.data || typeof body.data !== "object") {
        return jsonResponse({ error: "data is required" }, { status: 400 });
      }

      for (const key of Object.keys(kv)) {
        delete kv[key];
      }
      Object.assign(kv, body.data);
      scheduleSave();
      lastUpdated = new Date().toISOString();
      broadcast({ type: "snapshot", payload: kv });
      return jsonResponse({ ok: true });
    }

    if (pathParts[0] === "stats" && req.method === "GET") {
      return jsonResponse({ data: computeStats() });
    }
    return jsonResponse({ error: "unknown endpoint" }, { status: 404 });
  }

  if (req.method === "GET" && pathParts.length === 1) {
    return jsonResponse({ data: kv });
  }

  const key = decodeURIComponent(pathParts[1] ?? "");
  if (!key) {
    return jsonResponse({ error: "key is required" }, { status: 400 });
  }

  if (req.method === "GET") {
    if (!(key in kv)) {
      return jsonResponse({ error: "key not found" }, { status: 404 });
    }
    return jsonResponse({ key, value: kv[key] });
  }

  if (req.method === "PUT") {
    let body: { value?: KVValue } = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "invalid JSON body" }, { status: 400 });
    }

    if (!Object.prototype.hasOwnProperty.call(body, "value")) {
      return jsonResponse({ error: "value is required" }, { status: 400 });
    }

    kv[key] = body.value;
    scheduleSave();
    lastUpdated = new Date().toISOString();
    broadcast({ type: "set", payload: { key, value: body.value } });
    return jsonResponse({ ok: true, key });
  }

  if (req.method === "DELETE") {
    if (key in kv) {
      delete kv[key];
      scheduleSave();
      lastUpdated = new Date().toISOString();
      broadcast({ type: "delete", payload: { key } });
    }
    return jsonResponse({ ok: true, key });
  }

  return jsonResponse({ error: "method not allowed" }, { status: 405 });
}

console.log(`KV store running on http://localhost:${server.port}`);
