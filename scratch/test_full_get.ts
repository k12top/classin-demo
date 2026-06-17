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
  const courseId = "1e18e8de-2e91-4218-947a-83a41662ac3f";
  console.log("Fetching course with exact API includes...");
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      students: true,
      groupLinks: {
        include: {
          group: {
            include: {
              members: true,
            },
          },
        },
      },
    },
  });

  console.log("Course fetch succeeded!");
  console.log(JSON.stringify(course, null, 2));
}

main()
  .catch((e) => {
    console.error("Course fetch failed:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
