const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");

// Load .env manually
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach(line => {
    const matched = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
    if (matched) {
      const key = matched[1].trim();
      let val = matched[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[key] = val;
    }
  });
}

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Mock casdoorUserIdsMatch
function casdoorUserIdsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const strip = (s) => (s.includes("/") ? s.split("/").pop() : s);
  return strip(a) === strip(b);
}

async function simulate() {
  const courseId = "1e18e8de-2e91-4218-947a-83a41662ac3f";
  const userId = "test_student_passcode";
  const userName = "Test Student Passcode";

  console.log("1. Finding course...");
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

  if (!course) {
    console.error("Course not found!");
    return;
  }
  console.log("Course found:", course.name, "Passcode:", course.passcode);

  console.log("2. Inserting into CourseStudent...");
  try {
    const created = await prisma.courseStudent.create({
      data: {
        courseId: course.id,
        studentId: userId,
        studentName: userName,
      },
    });
    console.log("Created CourseStudent record:", created);
  } catch (err) {
    console.error("Failed to insert CourseStudent:", err);
  }

  console.log("3. Resolving course access...");
  const refreshed = await prisma.course.findUnique({
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

  const isDirectStudent = refreshed.students.some((s) =>
    casdoorUserIdsMatch(s.studentId, userId)
  );
  console.log("Is direct student after refreshed?", isDirectStudent);
}

simulate()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
