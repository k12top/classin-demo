import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Re-implement the promote logic in isolation to test
async function runTest() {
  console.log("Starting test-promote...");

  const rawDelay = process.env.COURSE_FINISHED_DELAY_MINUTES;
  console.log("rawDelay env:", rawDelay);
  
  const delayMinutes = 20; // fallback default
  const threshold = new Date(Date.now() - delayMinutes * 60 * 1000);
  console.log("Current time:", new Date());
  console.log("Threshold time (now - 20m):", threshold);

  // Let's find courses that match scheduled end promotion
  const coursesToFinish = await prisma.course.findMany({
    where: {
      status: {
        in: ["scheduled", "live", "afterClass"],
      },
      endTime: { not: null, lte: threshold },
    }
  });

  console.log("Courses that should be promoted to finished (endTime <= threshold):", coursesToFinish.map(c => ({
    id: c.id,
    name: c.name,
    status: c.status,
    endTime: c.endTime,
  })));

  // Let's find courses that match scheduled start promotion
  const coursesToStart = await prisma.course.findMany({
    where: {
      status: "scheduled",
      startTime: { not: null, lte: new Date() },
    }
  });

  console.log("Courses that should be promoted to live (startTime <= now):", coursesToStart.map(c => ({
    id: c.id,
    name: c.name,
    status: c.status,
    startTime: c.startTime,
  })));
}

runTest()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
