import { KVClient } from "../keyvalue-cluster/sdk/index.ts";

const baseUrl = Bun.env.KV_BASE_URL ?? "http://localhost:3000";
const client = new KVClient({ baseUrl });

function printHelp() {
  console.log(`\nKV Console Client\n\nCommands:\n  list                         List all keys\n  get <key>                    Fetch a key\n  set <key> <json>             Set a JSON value\n  delete <key>                 Delete a key\n  watch                        Listen for WebSocket updates\n\nExamples:\n  bun run index.ts set session:{\"id\":1} '{"user":"ana"}'\n  bun run index.ts get session:{\"id\":1}\n  bun run index.ts watch\n`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "list") {
    const data = await client.getAll();
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (command === "get") {
    const key = args[0];
    if (!key) {
      console.error("Missing key.");
      return;
    }
    const value = await client.get(key);
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  if (command === "set") {
    const key = args[0];
    const raw = args[1];
    if (!key || raw === undefined) {
      console.error("Usage: set <key> <json>");
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      console.error("Value must be valid JSON.");
      return;
    }
    await client.set(key, value);
    console.log(`Saved ${key}.`);
    return;
  }

  if (command === "delete") {
    const key = args[0];
    if (!key) {
      console.error("Missing key.");
      return;
    }
    await client.delete(key);
    console.log(`Deleted ${key}.`);
    return;
  }

  if (command === "watch") {
    console.log("Listening for updates...");
    client.on("open", () => console.log("WS connected"));
    client.on("close", () => console.log("WS disconnected"));
    client.on("snapshot", (data) => console.log("snapshot", data));
    client.on("set", (payload) => console.log("set", payload));
    client.on("delete", (payload) => console.log("delete", payload));
    client.connect();
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
}

await main();
