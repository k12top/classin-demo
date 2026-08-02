import { NextResponse } from "next/server";
import { isTransientDatabaseError } from "@/lib/db";

export function databaseUnavailableResponse(error: unknown) {
  if (!isTransientDatabaseError(error)) return null;
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
