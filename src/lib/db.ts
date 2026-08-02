import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import type { PoolConfig } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Bump when adding models so dev HMR does not keep a stale singleton. */
const PRISMA_SCHEMA_GENERATION = 16;

const globalForPrismaMeta = globalThis as unknown as {
  prismaSchemaGeneration?: number;
};

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error(
      "DATABASE_URL is not set. Configure PostgreSQL in .env.local for Prisma."
    );
  }
  const poolConfig: PoolConfig = {
    connectionString,
    max: positiveIntegerEnv("DATABASE_POOL_MAX", 3),
    connectionTimeoutMillis: positiveIntegerEnv(
      "DATABASE_CONNECT_TIMEOUT_MS",
      3_000,
    ),
    idleTimeoutMillis: positiveIntegerEnv("DATABASE_IDLE_TIMEOUT_MS", 300_000),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    allowExitOnIdle: process.env.NODE_ENV !== "production",
  };
  const adapter = new PrismaPg(poolConfig, {
    onPoolError(error) {
      console.error("[database:pool] background connection error", {
        message: error.message,
      });
    },
    onConnectionError(error) {
      console.warn("[database:connection] connection error", {
        message: error.message,
      });
    },
  });
  return new PrismaClient({ adapter });
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]?.trim() || fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]?.trim() || fallback);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

const TRANSIENT_DATABASE_CODES = new Set([
  "P1001",
  "P1002",
  "P1008",
  "P1017",
  "P2024",
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
]);

const TRANSIENT_DATABASE_MESSAGES = [
  "connection terminated unexpectedly",
  "server closed the connection unexpectedly",
  "terminating connection due to administrator command",
  "connection reset",
  "connection refused",
  "connection timeout",
  "connection timed out",
  "socket hang up",
  "broken pipe",
  "pool timeout",
];

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current = error;
  const visited = new Set<unknown>();
  while (current && chain.length < 8 && !visited.has(current)) {
    chain.push(current);
    visited.add(current);
    if (typeof current !== "object") break;
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

export function isTransientDatabaseError(error: unknown): boolean {
  return errorChain(error).some((item) => {
    const code =
      typeof item === "object" && item && "code" in item
        ? String((item as { code?: unknown }).code || "").toUpperCase()
        : "";
    if (TRANSIENT_DATABASE_CODES.has(code)) return true;
    const message =
      item instanceof Error
        ? item.message
        : typeof item === "string"
          ? item
          : typeof item === "object" && item && "message" in item
            ? String((item as { message?: unknown }).message || "")
            : "";
    const normalized = message.toLowerCase();
    return TRANSIENT_DATABASE_MESSAGES.some((value) =>
      normalized.includes(value),
    );
  });
}

type DatabaseReadRetryOptions = {
  retries?: number;
  baseDelayMs?: number;
};

/**
 * Retry only idempotent database reads after an explicit connection failure.
 * Callers must not wrap writes or transactions with this helper.
 */
export async function withDatabaseReadRetry<T>(
  operation: () => Promise<T>,
  options: DatabaseReadRetryOptions = {},
): Promise<T> {
  const retries = Math.max(
    0,
    Math.min(
      options.retries ?? nonNegativeIntegerEnv("DATABASE_READ_RETRIES", 1),
      2,
    ),
  );
  const baseDelayMs = Math.max(10, options.baseDelayMs ?? 120);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= retries || !isTransientDatabaseError(error)) throw error;
      const jitter = Math.floor(Math.random() * 80);
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelayMs * 2 ** attempt + jitter),
      );
    }
  }
}

function hasJoinLinkDelegate(client: PrismaClient): boolean {
  return "courseJoinLink" in client;
}

function hasCourseTeacherDelegate(client: PrismaClient): boolean {
  return "courseTeacher" in client;
}

function hasUserProfileDelegate(client: PrismaClient): boolean {
  return "userProfile" in client;
}

function hasCourseAttendanceDelegate(client: PrismaClient): boolean {
  return "courseAttendance" in client;
}

function hasClassroomRecordingDelegate(client: PrismaClient): boolean {
  return "classroomRecording" in client;
}

function hasClassroomRuntimeDelegate(client: PrismaClient): boolean {
  return (
    "classroomRuntime" in client &&
    "classroomMemberState" in client &&
    "classroomMessage" in client
  );
}

function hasCourseSessionDelegate(client: PrismaClient): boolean {
  return (
    "courseSession" in client &&
    "courseSessionSeries" in client &&
    "courseSessionTeacher" in client
  );
}

function getPrisma(): PrismaClient {
  const cached = globalForPrisma.prisma;
  const generation = globalForPrismaMeta.prismaSchemaGeneration;

  if (
    cached &&
    generation === PRISMA_SCHEMA_GENERATION &&
    hasJoinLinkDelegate(cached) &&
    hasCourseTeacherDelegate(cached) &&
    hasUserProfileDelegate(cached) &&
    hasCourseAttendanceDelegate(cached) &&
    hasClassroomRecordingDelegate(cached) &&
    hasClassroomRuntimeDelegate(cached) &&
    hasCourseSessionDelegate(cached)
  ) {
    return cached;
  }

  if (cached) {
    void cached.$disconnect().catch((error: unknown) => {
      console.warn("[database:pool] failed to retire stale development pool", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  const client = createPrisma();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrismaMeta.prismaSchemaGeneration = PRISMA_SCHEMA_GENERATION;
  }
  return client;
}

export const prisma = getPrisma();
