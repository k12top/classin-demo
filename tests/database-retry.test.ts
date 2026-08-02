import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://user:password@127.0.0.1:5432/classroom";

test("retries idempotent reads after transient disconnects", async () => {
  const { isTransientDatabaseError, withDatabaseReadRetry } = await import(
    "../src/lib/db"
  );
  assert.equal(
    isTransientDatabaseError(new Error("Connection terminated unexpectedly")),
    true,
  );
  let attempts = 0;
  const result = await withDatabaseReadRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("Connection terminated unexpectedly");
      }
      return "ok";
    },
    { retries: 2, baseDelayMs: 10 },
  );
  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("does not replay non-transient failures", async () => {
  const { withDatabaseReadRetry } = await import("../src/lib/db");
  let attempts = 0;
  await assert.rejects(
    withDatabaseReadRetry(async () => {
      attempts += 1;
      throw new Error("invalid query");
    }),
    /invalid query/,
  );
  assert.equal(attempts, 1);
});
