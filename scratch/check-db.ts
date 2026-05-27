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

async function main() {
  console.log("Checking courses in database...");
  const courses = await prisma.course.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  for (const c of courses) {
    console.log({
      id: c.id,
      name: c.name,
      status: c.status,
      startTime: c.startTime,
      endTime: c.endTime,
      createdAt: c.createdAt,
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
