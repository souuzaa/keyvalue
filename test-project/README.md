# Key-Value Message App (Example)

This is a tiny message app that stores conversations in a key-value store. The key is a conversation ID (two user names sorted and joined), and the value is the full message list for that conversation.

## Run

```bash
./start.sh
```

Then open `http://localhost:3100`.
Requires Bun to run the server.
The KV cluster must be running at `http://localhost:3000` (override with `KV_BASE_URL`).

## How the Key-Value Store Works

- `conversationId -> { participants, messages[] }` stored in the KV cluster at `http://localhost:3000`

You can view the current store snapshot in the UI.
