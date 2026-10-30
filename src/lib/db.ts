import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool, type PoolConfig } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Bump when adding models so dev HMR does not keep a stale singleton. */
const PRISMA_SCHEMA_GENERATION = 33;

const globalForPrismaMeta = globalThis as unknown as {
  prismaSchemaGeneration?: number;
  prismaPool?: Pool;
};

let databasePool: Pool | undefined;

/** Counts only; never expose database URLs, query text or parameters. */
export function databasePoolSnapshot() {
  const pool = databasePool;
  return pool ? {
    total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount,
    max: pool.options.max, connectionTimeoutMs: pool.options.connectionTimeoutMillis,
  } : null;
}

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error(
      "DATABASE_URL is not set. Configure PostgreSQL in .env.local for Prisma."
    );
  }
  const poolConfig: PoolConfig = {
    connectionString,
    // Entry, activity polling and presence share an instance. Keep ten slots
    // by default; deployment-specific limits can still use DATABASE_POOL_MAX.
    max: positiveIntegerEnv("DATABASE_POOL_MAX", 10),
    connectionTimeoutMillis: positiveIntegerEnv(
      "DATABASE_CONNECT_TIMEOUT_MS",
      3_000,
    ),
    idleTimeoutMillis: positiveIntegerEnv("DATABASE_IDLE_TIMEOUT_MS", 300_000),
    // Rotate long-lived remote TCP connections before infrastructure such as a
    // NAT, proxy or managed PostgreSQL service closes them underneath pg.
    maxLifetimeSeconds: positiveIntegerEnv(
      "DATABASE_CONNECTION_MAX_LIFETIME_SECONDS",
      900,
    ),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    // Server-side limits cancel the SQL itself. A browser or Prisma timeout
    // alone can leave a query holding a pool slot and classroom row locks.
    statement_timeout: positiveIntegerEnv("DATABASE_STATEMENT_TIMEOUT_MS", 4_000),
    lock_timeout: positiveIntegerEnv("DATABASE_LOCK_TIMEOUT_MS", 1_000),
    idle_in_transaction_session_timeout: positiveIntegerEnv(
      "DATABASE_IDLE_TRANSACTION_TIMEOUT_MS", 15_000,
    ),
    allowExitOnIdle: process.env.NODE_ENV !== "production",
  };
  databasePool = new Pool(poolConfig);
  const adapter = new PrismaPg(databasePool, {
    disposeExternalPool: true,
    onPoolError(error) {
      console.error("[database:pool] background connection error", {
        message: error.message,
        pool: databasePoolSnapshot(),
      });
    },
    onConnectionError(error) {
      console.warn("[database:connection] connection error", {
        message: error.message,
        pool: databasePoolSnapshot(),
      });
    },
  });
  const client = new PrismaClient({ adapter, log: [{ emit: "event", level: "query" }] });
  client.$on("query", (event) => {
    if (event.duration < 1_000) return;
    const command = /^\s*(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|SET)\b/i.exec(event.query)?.[1]?.toUpperCase() || "OTHER";
    console.warn("[database:slow]", { command, durationMs: event.duration, pool: databasePoolSnapshot() });
  });
  return client;
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
  "EAI_AGAIN",
  "ETIMEDOUT",
  "53300",
  "57P01",
  "57P02",
  "57P03",
  "55P03", // PostgreSQL lock_timeout; the failed transaction is rolled back.
  "57014", // Server-side statement_timeout.
  "40001", // Transaction rolled back due to a serialization conflict.
  "40P01", // Transaction rolled back due to a deadlock.
  "P2034",
  "ENTRY_BUSY",
]);

const TRANSIENT_DATABASE_MESSAGES = [
  "connection terminated unexpectedly",
  "server closed the connection unexpectedly",
  "terminating connection due to administrator command",
  "connection reset",
  "connection refused",
  "connection timeout",
  "connection timed out",
  "timeout exceeded when trying to connect",
  "connection is closed",
  "can't reach database",
  "too many clients",
  "socket hang up",
  "broken pipe",
  "pool timeout",
  "canceling statement due to lock timeout",
];

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  const pending: unknown[] = [error];
  const visited = new Set<unknown>();
  while (pending.length && chain.length < 12) {
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    chain.push(current);
    visited.add(current);
    if (typeof current !== "object") continue;
    const value = current as { cause?: unknown; meta?: { driverAdapterError?: unknown } };
    pending.push(value.cause, value.meta?.driverAdapterError);
  }
  return chain;
}

/** Only replay a whole operation after PostgreSQL confirms its rollback. */
export async function withDatabaseConflictRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const conflict = isDatabaseRollbackConflict(error);
      if (!conflict || attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * 2 ** attempt + Math.floor(Math.random() * 50)));
    }
  }
}

function isDatabaseRollbackConflict(error: unknown): boolean {
  return errorChain(error).some(item => {
    const code = item && typeof item === "object" && "code" in item ? String(item.code) : "";
    return ["P2034", "40001", "40P01"].includes(code) ||
      Boolean(item && typeof item === "object" && "kind" in item && item.kind === "TransactionWriteConflict");
  });
}

export function isTransientDatabaseError(error: unknown): boolean {
  if (isDatabaseRollbackConflict(error)) return true;
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
    if (code === "P2028" && (
      normalized.includes("unable to start a transaction in the given time") ||
      normalized.includes("expired transaction")
    )) return true;
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

function hasCoursePlaybackProgressDelegate(client: PrismaClient): boolean {
  return "coursePlaybackProgress" in client;
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
    "courseSessionTeacher" in client &&
    "courseSessionStudentSubmission" in client
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
    hasCoursePlaybackProgressDelegate(cached) &&
    hasClassroomRecordingDelegate(cached) &&
    hasClassroomRuntimeDelegate(cached) &&
    hasCourseSessionDelegate(cached)
  ) {
    databasePool = globalForPrismaMeta.prismaPool;
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
    globalForPrismaMeta.prismaPool = databasePool;
  }
  return client;
}

export const prisma = getPrisma();
