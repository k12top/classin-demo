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
  console.log("Populating recordUrl for finished courses...");
  const finishedCourses = await prisma.course.findMany({
    where: {
      status: "finished",
      recordUrl: null,
    },
  });

  console.log(`Found ${finishedCourses.length} finished courses without recordUrl.`);

  for (const course of finishedCourses) {
    const roomUuid = course.id.replace(/-/g, "").slice(0, 16);
    const recordUrl = `https://solutions-apaas.agora.io/static/record_page_prod.html?roomUuid=${roomUuid}&roomType=${course.roomType}`;
    
    await prisma.course.update({
      where: { id: course.id },
      data: { recordUrl },
    });

    console.log(`Updated course "${course.name}" (ID: ${course.id}) with recordUrl: ${recordUrl}`);
  }

  console.log("Finished successfully!");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
