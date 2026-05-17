/**
 * Token generation API — session-bound user + course access
 */
import { NextRequest, NextResponse } from "next/server";
import { buildRoomUserToken } from "@/lib/agora-token";
import { getSession } from "@/lib/session";
import {
  courseIdToRoomUuid,
  resolveCourseAccess,
} from "@/lib/course-access";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized — please log in first" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { roomUuid, courseId, userUuid } = body;

    if (!roomUuid || !courseId) {
      return NextResponse.json(
        { error: "Missing required fields: roomUuid, courseId" },
        { status: 400 }
      );
    }

    if (
      userUuid !== undefined &&
      userUuid !== null &&
      String(userUuid) !== session.userId
    ) {
      return NextResponse.json(
        { error: "userUuid does not match the signed-in user" },
        { status: 403 }
      );
    }

    const expectedRoom = courseIdToRoomUuid(String(courseId));
    if (String(roomUuid) !== expectedRoom) {
      return NextResponse.json(
        { error: "roomUuid does not match this course" },
        { status: 403 }
      );
    }

    const access = await resolveCourseAccess(String(courseId), session.userId);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.reason || "Not allowed for this course" },
        { status: access.httpStatus === 404 ? 404 : 403 }
      );
    }

    const role = access.role === "teacher" ? 1 : 2;

    const appId = process.env.AGORA_APP_ID;
    if (!appId) {
      return NextResponse.json(
        { error: "Server misconfiguration: missing AGORA_APP_ID" },
        { status: 500 }
      );
    }

    const token = buildRoomUserToken(roomUuid, session.userId, role);

    return NextResponse.json({ token, appId });
  } catch (error) {
    console.error("Token generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
