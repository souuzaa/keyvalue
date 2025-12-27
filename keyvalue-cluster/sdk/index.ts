type KVValue = unknown;

type SnapshotHandler = (data: Record<string, KVValue>) => void;
type SetHandler = (payload: { key: string; value: KVValue }) => void;
type DeleteHandler = (payload: { key: string }) => void;

type KVEvents = {
  snapshot: SnapshotHandler;
  set: SetHandler;
  delete: DeleteHandler;
  close: () => void;
  open: () => void;
};

type KVEventName = keyof KVEvents;

type ListenerMap = {
  [K in KVEventName]?: Set<KVEvents[K]>;
};

export type KVClientOptions = {
  baseUrl?: string;
  reconnectIntervalMs?: number;
};

export class KVClient {
  private baseUrl: string;
  private reconnectIntervalMs: number;
  private socket: WebSocket | null = null;
  private listeners: ListenerMap = {};
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: KVClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://localhost:3000";
    this.reconnectIntervalMs = options.reconnectIntervalMs ?? 1000;
  }

  async getAll() {
    const res = await fetch(`${this.baseUrl}/api/kv`);
    if (!res.ok) {
      throw new Error(`Failed to fetch store: ${res.status}`);
    }
    const body = await res.json();
    return body.data as Record<string, KVValue>;
  }

  async get(key: string) {
    const res = await fetch(`${this.baseUrl}/api/kv/${encodeURIComponent(key)}`);
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch key: ${res.status}`);
    }
    const body = await res.json();
    return body.value as KVValue;
  }

  async set(key: string, value: KVValue) {
    const res = await fetch(`${this.baseUrl}/api/kv/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value })
    });
    if (!res.ok) {
      throw new Error(`Failed to set key: ${res.status}`);
    }
  }

  async delete(key: string) {
    const res = await fetch(`${this.baseUrl}/api/kv/${encodeURIComponent(key)}`, {
      method: "DELETE"
    });
    if (!res.ok) {
      throw new Error(`Failed to delete key: ${res.status}`);
    }
  }

  connect() {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      return;
    }
    const wsUrl = this.baseUrl.replace("http", "ws");
    this.socket = new WebSocket(`${wsUrl}/ws`);

    this.socket.addEventListener("open", () => {
      this.emit("open");
    });

    this.socket.addEventListener("close", () => {
      this.emit("close");
      this.scheduleReconnect();
    });

    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type === "snapshot") {
        this.emit("snapshot", message.payload ?? {});
      }
      if (message.type === "set") {
        this.emit("set", message.payload);
      }
      if (message.type === "delete") {
        this.emit("delete", message.payload);
      }
    });
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  on<K extends KVEventName>(event: K, handler: KVEvents[K]) {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event]?.add(handler as KVEvents[K]);
    return () => this.off(event, handler);
  }

  off<K extends KVEventName>(event: K, handler: KVEvents[K]) {
    this.listeners[event]?.delete(handler as KVEvents[K]);
  }

  private emit<K extends KVEventName>(event: K, payload?: Parameters<KVEvents[K]>[0]) {
    const handlers = this.listeners[event];
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      (handler as (value?: Parameters<KVEvents[K]>[0]) => void)(payload);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectIntervalMs);
  }
}
