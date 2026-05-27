import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  // Dynamically import after dotenv has been configured
  const { promoteCoursesIfDue } = await import("../src/lib/course-promote");
  const { prisma } = await import("../src/lib/db");

  console.log("Before promotion:");
  const cBefore = await prisma.course.findUnique({
    where: { id: "3dd3e4d1-0408-4e1b-8a9b-39d290fb90cb" }
  });
  console.log("毕业答辩 status before:", cBefore?.status);

  console.log("Running promoteCoursesIfDue()...");
  const count = await promoteCoursesIfDue();
  console.log("Updated rows count:", count);

  console.log("After promotion:");
  const cAfter = await prisma.course.findUnique({
    where: { id: "3dd3e4d1-0408-4e1b-8a9b-39d290fb90cb" }
  });
  console.log("毕业答辩 status after:", cAfter?.status);
}

main()
  .catch(console.error);
