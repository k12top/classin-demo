import assert from "node:assert/strict";
import test from "node:test";
import {
  isTransientWhiteboardError,
  retryWhiteboardRequest,
} from "../src/lib/classroom/whiteboard/retry";

test("temporary Netless failures recover without retrying invalid credentials", async () => {
  let attempts = 0;
  const result = await retryWhiteboardRequest(
    async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("fetch failed");
      return "room-token";
    },
    isTransientWhiteboardError,
    async () => undefined,
  );
  assert.equal(result, "room-token");
  assert.equal(attempts, 3);

  attempts = 0;
  await assert.rejects(
    retryWhiteboardRequest(
      async () => {
        attempts += 1;
        throw new Error("HTTP 401");
      },
      isTransientWhiteboardError,
      async () => undefined,
    ),
    /HTTP 401/,
  );
  assert.equal(attempts, 1);
});

test("Fastboard pong timeouts are transient and retry attempts stay bounded", async () => {
  assert.equal(isTransientWhiteboardError(new Error("pong timeout")), true);
  let attempts = 0;
  await assert.rejects(
    retryWhiteboardRequest(
      async () => {
        attempts += 1;
        throw new Error("pong timeout");
      },
      isTransientWhiteboardError,
      async () => undefined,
    ),
    /pong timeout/,
  );
  assert.equal(attempts, 3);
});
