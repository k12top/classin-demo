import { NextResponse } from "next/server";
import { databasePoolSnapshot, isTransientDatabaseError } from "@/lib/db";

export function databaseUnavailableResponse(error: unknown) {
  if (!isTransientDatabaseError(error)) return null;
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
  console.warn("[database:unavailable]", {
    code: /^[A-Z0-9_]{1,16}$/.test(code) ? code : "unknown",
    pool: databasePoolSnapshot(),
  });
  return NextResponse.json(
    {
      error: "Database temporarily unavailable",
      code: "database_unavailable",
      retryable: true,
    },
    {
      status: 503,
      headers: { "Retry-After": "2" },
    },
  );
}
