const http = require("http");
const { URL } = require("url");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || 3000;

// Key-value store: conversationId -> { participants: [a,b], messages: [...] }
const conversations = new Map();
// Key-value index: user -> Set(conversationId)
const userIndex = new Map();

function conversationIdFor(a, b) {
  const pair = [a.trim(), b.trim()].sort();
  return `${pair[0]}|${pair[1]}`;
}

function ensureConversation(a, b) {
  const id = conversationIdFor(a, b);
  if (!conversations.has(id)) {
    conversations.set(id, {
      participants: [a, b],
      messages: [],
    });
  }
  if (!userIndex.has(a)) userIndex.set(a, new Set());
  if (!userIndex.has(b)) userIndex.set(b, new Set());
  userIndex.get(a).add(id);
  userIndex.get(b).add(id);
  return id;
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
    const convo = conversations.get(id);
    return json(res, 200, {
      ok: true,
      conversationId: id,
      messages: convo ? convo.messages : [],
    });
  }

  if (req.method === "GET" && url.pathname === "/api/threads") {
    const user = url.searchParams.get("user") || "";
    if (!user) {
      return json(res, 400, { ok: false, error: "Missing user" });
    }
    const ids = Array.from(userIndex.get(user) || []);
    const threads = ids
      .map((id) => {
        const convo = conversations.get(id);
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
  }

  if (req.method === "GET" && url.pathname === "/api/store") {
    const store = {};
    for (const [id, convo] of conversations.entries()) {
      store[id] = {
        participants: convo.participants,
        messages: convo.messages,
      };
    }
    return json(res, 200, { ok: true, store });
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

      const id = ensureConversation(from, to);
      const convo = conversations.get(id);
      const message = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        from,
        to,
        text,
        ts: Date.now(),
      };
      convo.messages.push(message);

      return json(res, 200, { ok: true, conversationId: id, message });
    } catch (err) {
      return json(res, 400, { ok: false, error: "Invalid JSON" });
    }
  }

  return notFound(res);
});

server.listen(PORT, () => {
  console.log(`Message app listening on http://localhost:${PORT}`);
});
