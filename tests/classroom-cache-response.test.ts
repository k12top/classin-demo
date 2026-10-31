import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";
import { ClassroomCacheUnavailableError } from "../src/lib/classroom/cache-error";
test("cache failures produce cache diagnostics and real pool failures retain database diagnostics", async () => {
  const api = loadModule<{ databaseUnavailableResponse: (e: unknown) => Response | null }>("src/lib/database-response.ts", {
    "@/lib/classroom/cache-error": { ClassroomCacheUnavailableError },
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/db": { databasePoolSnapshot: () => ({ idle: 7, waiting: 0 }), isTransientDatabaseError: (e: { code: string }) => e?.code === "P2024" },
  });
  const old = console.warn, logs: unknown[][] = []; console.warn = (...args) => { logs.push(args); };
  try {
    const cache = api.databaseUnavailableResponse(new ClassroomCacheUnavailableError("unavailable"))!;
    assert.equal(cache.status, 503); assert.equal((await cache.json()).code, "classroom_cache_unavailable");
    assert.equal(logs[0][0], "[classroom:cache-unavailable]");
    const pg = api.databaseUnavailableResponse({ code: "P2024" })!;
    assert.equal((await pg.json()).code, "database_unavailable"); assert.equal(logs[1][0], "[database:unavailable]");
    assert.equal(api.databaseUnavailableResponse(new Error("bug")), null);
  } finally { console.warn = old; }
});
