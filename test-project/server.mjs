import http from "http";
import { URL, fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { KVClient } from "../keyvalue-cluster/sdk/index.ts";

const PORT = process.env.PORT || 3100;
const KV_BASE_URL = process.env.KV_BASE_URL || "http://localhost:3000";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new KVClient({ baseUrl: KV_BASE_URL });

function conversationIdFor(a, b) {
  const pair = [a.trim(), b.trim()].sort();
  return `${pair[0]}|${pair[1]}`;
}

async function loadStore() {
  const store = await client.getAll();
  if (!store || typeof store !== "object") {
    return {};
  }
  return store;
}

function normalizeConversation(convo) {
  if (!convo || typeof convo !== "object") {
    return null;
  }
  const participants = Array.isArray(convo.participants) ? convo.participants : [];
  const messages = Array.isArray(convo.messages) ? convo.messages : [];
  return { participants, messages };
}

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      notFound(res);
      return;
    }
    const ext = path.extname(filePath);
    const contentType = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
    }[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/") {
    return serveStatic(res, path.join(__dirname, "public", "index.html"));
  }

  if (req.method === "GET" && url.pathname.startsWith("/public/")) {
    const relativePath = url.pathname.replace("/public/", "");
    return serveStatic(res, path.join(__dirname, "public", relativePath));
  }

  if (req.method === "GET" && url.pathname === "/api/messages") {
    const user = url.searchParams.get("user") || "";
    const withUser = url.searchParams.get("with") || "";
    if (!user || !withUser) {
      return json(res, 400, { ok: false, error: "Missing user or with" });
    }
    const id = conversationIdFor(user, withUser);
    try {
      const convo = normalizeConversation(await client.get(id));
      return json(res, 200, {
        ok: true,
        conversationId: id,
        messages: convo ? convo.messages : [],
      });
    } catch (err) {
      return json(res, 502, { ok: false, error: "KV store unavailable" });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/threads") {
    const user = url.searchParams.get("user") || "";
    if (!user) {
      return json(res, 400, { ok: false, error: "Missing user" });
    }
    try {
      const store = await loadStore();
      const threads = Object.values(store)
        .map((raw) => normalizeConversation(raw))
        .filter((convo) => convo && convo.participants.includes(user))
        .map((convo) => {
          const other = convo.participants.find((p) => p !== user) || user;
          const last = convo.messages[convo.messages.length - 1] || null;
          return {
            with: other,
            lastText: last ? last.text : "",
            lastTs: last ? last.ts : 0,
          };
        })
        .sort((a, b) => b.lastTs - a.lastTs);

      return json(res, 200, { ok: true, threads });
    } catch (err) {
      return json(res, 502, { ok: false, error: "KV store unavailable" });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/store") {
    try {
      const store = await loadStore();
      return json(res, 200, { ok: true, store });
    } catch (err) {
      return json(res, 502, { ok: false, error: "KV store unavailable" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/send") {
    try {
      const raw = await collectRequestBody(req);
      const body = JSON.parse(raw || "{}");
      const from = String(body.from || "").trim();
      const to = String(body.to || "").trim();
      const text = String(body.text || "").trim();
      if (!from || !to || !text) {
        return json(res, 400, { ok: false, error: "Missing from, to, or text" });
      }

      const id = conversationIdFor(from, to);
      const existing = normalizeConversation(await client.get(id));
      const convo = existing || {
        participants: [from, to],
        messages: [],
      };
      const message = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        from,
        to,
        text,
        ts: Date.now(),
      };
      convo.messages.push(message);
      await client.set(id, convo);

      return json(res, 200, { ok: true, conversationId: id, message });
    } catch (err) {
      const status = err instanceof SyntaxError ? 400 : 502;
      const error = err instanceof SyntaxError ? "Invalid JSON" : "KV store unavailable";
      return json(res, status, { ok: false, error });
    }
  }

  return notFound(res);
});

server.listen(PORT, () => {
  console.log(`Message app listening on http://localhost:${PORT}`);
});
