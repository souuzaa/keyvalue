# Bun KV SDK

Small Bun.js-compatible SDK for the KV Vault service.

## Usage

```ts
import { KVClient } from "./sdk/index.ts";

const client = new KVClient({ baseUrl: "http://localhost:3000" });

await client.set("demo", { hello: "world" });
const value = await client.get("demo");
console.log(value);

client.on("snapshot", (data) => console.log("snapshot", data));
client.on("set", (payload) => console.log("set", payload));
client.connect();
```

## API

- `getAll()` - fetch entire KV store.
- `get(key)` - fetch value by key, returns `null` if missing.
- `set(key, value)` - store a JSON-serializable value.
- `delete(key)` - delete a key.
- `connect()` - open WebSocket updates.
- `disconnect()` - close WebSocket updates.
- `on(event, handler)` - subscribe to `snapshot`, `set`, `delete`, `open`, `close`.
