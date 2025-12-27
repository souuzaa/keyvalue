# KeyValue Project

Monorepo with a Bun-based key/value service and a console client used for manual
testing and perf checks.

## Main solution: KV service

Location: `keyvalue-cluster/`

### Run locally (Bun)

```bash
cd keyvalue-cluster
bun install
bun run dev
```

Open `http://localhost:3000`.

### Run with redundancy manager

Starts a manager on port 3000 and 3 replicas on ports 3001-3003. Each replica
stores data under `keyvalue-cluster/data/replica-*`.

```bash
cd keyvalue-cluster
bun run redundancy
```

### Run with Docker

```bash
cd keyvalue-cluster
docker compose up --build
```

Data is persisted to `keyvalue-cluster/data/kv.json`.

## Test solution: console client

Location: `keyvalue-test/`

### Setup

Make sure the KV service is running on `http://localhost:3000`.

### Run

```bash
cd keyvalue-test
bun install
bun run index.ts list
bun run index.ts get demo
bun run index.ts set demo '{"value":42}'
bun run index.ts delete demo
bun run index.ts watch
```

### Performance

Requires k6 installed locally.

```bash
cd keyvalue-test
BASE_URL=http://localhost:3000 k6 run perf/k6-kv.js
```

### Configuration

Set `KV_BASE_URL` to point to a different service:

```bash
cd keyvalue-test
KV_BASE_URL=http://localhost:3000 bun run index.ts list
```
