import { afterEach, expect, test } from "bun:test";
import { KVClient } from "../sdk/index";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("KVClient.get returns a value when the key exists", async () => {
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/kv/example")) {
      return new Response(JSON.stringify({ value: "stored-value" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(null, { status: 404 });
  };

  const client = new KVClient({ baseUrl: "http://localhost:3000" });
  const value = await client.get("example");
  expect(value).toBe("stored-value");
});

test("KVClient.set sends the payload and accepts success responses", async () => {
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method).toBe("PUT");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(init?.body).toBe(JSON.stringify({ value: 42 }));
    return new Response(null, { status: 200 });
  };

  const client = new KVClient({ baseUrl: "http://localhost:3000" });
  await client.set("answer", 42);
});

test("KVClient.delete sends a DELETE request", async () => {
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method).toBe("DELETE");
    return new Response(null, { status: 200 });
  };

  const client = new KVClient({ baseUrl: "http://localhost:3000" });
  await client.delete("obsolete");
});

test("KVClient.getAll returns the full store", async () => {
  const store = { a: 1, b: "two" };
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    expect(url.endsWith("/api/kv")).toBe(true);
    return new Response(JSON.stringify({ data: store }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const client = new KVClient({ baseUrl: "http://localhost:3000" });
  const data = await client.getAll();
  expect(data).toEqual(store);
});
