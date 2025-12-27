# Sample Project Console

Console client that uses the Bun KV SDK to talk to the local KV service.

## Setup

Make sure the KV service is running on `http://localhost:3000`.

## Run

```bash
bun run index.ts list
bun run index.ts get demo
bun run index.ts set demo '{"value":42}'
bun run index.ts delete demo
bun run index.ts watch
```

## Performance

Requires k6 installed locally.

```bash
BASE_URL=http://localhost:3000 k6 run perf/k6-kv.js
```

## Configuration

Set `KV_BASE_URL` to point to a different service:

```bash
KV_BASE_URL=http://localhost:3000 bun run index.ts list
```
