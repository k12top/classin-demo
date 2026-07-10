import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Bump when adding models so dev HMR does not keep a stale singleton. */
const PRISMA_SCHEMA_GENERATION = 8;

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
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
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

function getPrisma(): PrismaClient {
  const cached = globalForPrisma.prisma;
  const generation = globalForPrismaMeta.prismaSchemaGeneration;

  if (
    cached &&
    generation === PRISMA_SCHEMA_GENERATION &&
    hasJoinLinkDelegate(cached) &&
    hasCourseTeacherDelegate(cached) &&
    hasUserProfileDelegate(cached) &&
    hasCourseAttendanceDelegate(cached)
  ) {
    return cached;
  }

  const client = createPrisma();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrismaMeta.prismaSchemaGeneration = PRISMA_SCHEMA_GENERATION;
  }
  return client;
}

export const prisma = getPrisma();
