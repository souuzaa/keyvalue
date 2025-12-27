# Bun KV Vault

Local Bun.js website with a REST + WebSocket key/value store and JSON persistence.

## Run locally (Bun)

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

## Run with redundancy manager

Starts a manager on port 3000 and 3 replicas on ports 3001-3003. Each replica
stores data under `./data/replica-*`.

```bash
bun run redundancy
```

## Run with Docker

```bash
docker compose up --build
```

Data is persisted to `./data/kv.json`.

## SDK

The Bun-compatible SDK lives in `sdk/index.ts`. See `sdk/README.md` for usage.
