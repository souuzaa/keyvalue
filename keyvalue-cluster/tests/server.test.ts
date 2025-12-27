import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { createServer } from "../server";

let baseUrl = "";
let server: ReturnType<typeof Bun.serve> | null = null;
let dataDir = "";
let dataDirPersistent = "";

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "kv-store-"));
  dataDirPersistent = await mkdtemp(path.join(os.tmpdir(), "kv-store-persist-"));
  const result = await createServer({ port: 0, dataDir, quiet: true });
  server = result.server;
  baseUrl = `http://localhost:${server.port}`;
});

afterAll(async () => {
  server?.stop(true);
  if (dataDir) {
    await rm(dataDir, { recursive: true, force: true });
  }
  if (dataDirPersistent) {
    await rm(dataDirPersistent, { recursive: true, force: true });
  }
});

test("KV API supports set/get/delete", async () => {
  const setRes = await fetch(`${baseUrl}/api/kv/ci-key`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "hello" })
  });
  expect(setRes.ok).toBe(true);

  const getRes = await fetch(`${baseUrl}/api/kv/ci-key`);
  expect(getRes.status).toBe(200);
  const getBody = await getRes.json();
  expect(getBody.value).toBe("hello");

  const deleteRes = await fetch(`${baseUrl}/api/kv/ci-key`, {
    method: "DELETE"
  });
  expect(deleteRes.ok).toBe(true);

  const missingRes = await fetch(`${baseUrl}/api/kv/ci-key`);
  expect(missingRes.status).toBe(404);
});

test("stats and replication endpoints respond with expected payloads", async () => {
  const replicateRes = await fetch(`${baseUrl}/api/replicate`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: { alpha: 1, beta: "two" } })
  });
  expect(replicateRes.ok).toBe(true);

  const listRes = await fetch(`${baseUrl}/api/kv`);
  const listBody = await listRes.json();
  expect(listBody.data).toEqual({ alpha: 1, beta: "two" });

  const statsRes = await fetch(`${baseUrl}/api/stats`);
  expect(statsRes.ok).toBe(true);
  const statsBody = await statsRes.json();
  expect(statsBody.data.totalKeys).toBe(2);
  expect(typeof statsBody.data.startedAt).toBe("string");
});

test("websocket clients receive snapshot and updates", async () => {
  const wsUrl = baseUrl.replace("http", "ws");
  const messages: Array<{ type: string; payload?: unknown }> = [];
  const ws = new WebSocket(`${wsUrl}/ws`);

  const opened = new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("ws error")));
  });

  ws.addEventListener("message", (event) => {
    messages.push(JSON.parse(String(event.data)));
  });

  await opened;

  const setRes = await fetch(`${baseUrl}/api/kv/ws-key`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "stream" })
  });
  expect(setRes.ok).toBe(true);

  await new Promise((resolve) => setTimeout(resolve, 50));
  ws.close();

  expect(messages.length).toBeGreaterThan(0);
  expect(messages[0].type).toBe("snapshot");
  expect(messages.some((message) => message.type === "set")).toBe(true);
});

test("data persists to disk across restarts", async () => {
  let currentServer: ReturnType<typeof Bun.serve> | null = null;

  const first = await createServer({ port: 0, dataDir: dataDirPersistent, quiet: true });
  currentServer = first.server;
  const firstBaseUrl = `http://localhost:${currentServer.port}`;

  const setRes = await fetch(`${firstBaseUrl}/api/kv/persist-key`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: { nested: "value" } })
  });
  expect(setRes.ok).toBe(true);

  await new Promise((resolve) => setTimeout(resolve, 200));
  currentServer.stop(true);

  const second = await createServer({ port: 0, dataDir: dataDirPersistent, quiet: true });
  currentServer = second.server;
  const secondBaseUrl = `http://localhost:${currentServer.port}`;

  const getRes = await fetch(`${secondBaseUrl}/api/kv/persist-key`);
  expect(getRes.status).toBe(200);
  const getBody = await getRes.json();
  expect(getBody.value).toEqual({ nested: "value" });

  currentServer.stop(true);
});
