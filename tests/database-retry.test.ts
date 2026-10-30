import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://user:password@127.0.0.1:5432/classroom";

test("nested PostgreSQL timeout and rollback conflicts are retryable responses", async () => {
  const { isTransientDatabaseError } = await import("../src/lib/db");
  for (const code of ["57014", "40001", "40P01"]) {
    assert.equal(isTransientDatabaseError({ code: "P2010", meta: { driverAdapterError: { cause: { code } } } }), true);
  }
  assert.equal(isTransientDatabaseError({ code: "P2010", meta: { driverAdapterError: { cause: { code: "42601" } } } }), false);
  assert.equal(isTransientDatabaseError({ code: "P2010", meta: { driverAdapterError: { cause: { kind: "TransactionWriteConflict" } } } }), true);
});

test("only confirmed rollback conflicts replay the whole operation", async () => {
  const { withDatabaseConflictRetry } = await import("../src/lib/db");
  let calls = 0;
  const result = await withDatabaseConflictRetry(async () => {
    if (++calls === 1) throw { code: "P2010", meta: { driverAdapterError: { cause: { code: "40001" } } } };
    return "joined";
  });
  assert.equal(result, "joined");
  assert.equal(calls, 2);
  for (const code of ["P2028", "57014", "ECONNRESET"]) {
    let attempts = 0;
    await assert.rejects(withDatabaseConflictRetry(async () => { attempts++; throw Object.assign(new Error("unconfirmed"), { code }); }));
    assert.equal(attempts, 1, "must not replay a write with uncertain outcome");
  }
});

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

test("recognizes managed PostgreSQL connection eviction errors", async () => {
  const { isTransientDatabaseError } = await import("../src/lib/db");
  assert.equal(
    isTransientDatabaseError({ code: "57P01", message: "admin shutdown" }),
    true,
  );
  assert.equal(
    isTransientDatabaseError(new Error("too many clients already")),
    true,
  );
  assert.equal(
    isTransientDatabaseError(new Error("timeout exceeded when trying to connect")),
    true,
  );
});

test("transaction acquisition and lock timeouts are temporary, invalid transaction usage is not", async () => {
  const { isTransientDatabaseError } = await import("../src/lib/db");
  assert.equal(isTransientDatabaseError({ code: "P2028", message: "Transaction API error: Unable to start a transaction in the given time." }), true);
  assert.equal(isTransientDatabaseError({ code: "P2028", message: "A query cannot be executed on an expired transaction." }), true);
  assert.equal(isTransientDatabaseError({ code: "P2028", message: "Invalid transaction identifier" }), false);
  assert.equal(isTransientDatabaseError({ code: "P2010", message: "canceling statement due to lock timeout" }), true);
});
