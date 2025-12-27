import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "10s", target: 10 },
    { duration: "20s", target: 25 },
    { duration: "10s", target: 0 }
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<250"]
  }
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export default function () {
  const key = `k6:${__VU}:${__ITER}`;
  const value = { id: __ITER, vu: __VU, ts: Date.now() };

  const setRes = http.put(
    `${BASE_URL}/api/kv/${encodeURIComponent(key)}`,
    JSON.stringify({ value }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(setRes, { "set 200": (r) => r.status === 200 });

  const getRes = http.get(`${BASE_URL}/api/kv/${encodeURIComponent(key)}`);
  check(getRes, { "get 200": (r) => r.status === 200 });

  const delRes = http.del(`${BASE_URL}/api/kv/${encodeURIComponent(key)}`);
  check(delRes, { "delete 200": (r) => r.status === 200 });

  sleep(1);
}
