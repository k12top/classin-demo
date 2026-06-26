import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: courseId } = await params;
    const body = await request.json();
    const { passcode } = body;

    if (!passcode) {
      return NextResponse.json({ error: "请输入入会密码" }, { status: 400 });
    }

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
      return NextResponse.json({ error: "课程不存在" }, { status: 404 });
    }

    if (course.roomType !== 10) {
      return NextResponse.json({ error: "此课程不是公开课，无法通过密码加入" }, { status: 400 });
    }

    if (course.passcode !== passcode.trim()) {
      return NextResponse.json({ error: "密码错误，请重新输入" }, { status: 400 });
    }

    // Check if already enrolled (directly or via group)
    const isDirectStudent = course.students.some(s => casdoorUserIdsMatch(s.studentId, session.userId));
    let isGroupStudent = false;
    for (const link of course.groupLinks) {
      for (const member of link.group.members) {
        if (casdoorUserIdsMatch(member.userId, session.userId)) {
          isGroupStudent = true;
          break;
        }
      }
      if (isGroupStudent) break;
    }

    if (!isDirectStudent && !isGroupStudent) {
      // Add the student to the CourseStudent table
      await prisma.courseStudent.create({
        data: {
          courseId: course.id,
          studentId: session.userId,
          studentName: session.displayName || session.name,
          studentAvatar: session.avatar || "",
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("join-by-passcode error:", error);
    return NextResponse.json({ error: "加入课程失败，请稍后重试" }, { status: 500 });
  }
}
