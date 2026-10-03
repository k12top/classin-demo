/**
 * Course share / live join links (teacher only)
 * GET  /api/courses/:id/join-links — list
 * POST /api/courses/:id/join-links — create
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import { assertTeacherOwnsCourse } from "@/lib/course-teacher";

export const dynamic = "force-dynamic";
import {
  buildCourseShareUrl,
  buildEmbedSnippet,
  buildJoinUrl,
  createJoinPasscode,
  createJoinToken,
  isValidJoinPasscode,
  isJoinLinkPurpose,
  JoinLinkPurpose,
  joinLinkStatus,
} from "@/lib/join-link";

function serializeLink(
  link: {
    id: string;
    token: string;
    purpose: string;
    passcode: string | null;
    label: string;
    expiresAt: Date | null;
    revokedAt: Date | null;
    useCount: number;
    lastUsedAt: Date | null;
    createdAt: Date;
  },
  origin: string
) {
  const status = joinLinkStatus(link);
  const purpose: JoinLinkPurpose = link.purpose === "course" ? "course" : "live";
  const liveUrl = buildJoinUrl(origin, link.token);
  const courseShareUrl = buildCourseShareUrl(origin, link.token);
  const shareUrl = purpose === "course" ? courseShareUrl : liveUrl;
  return {
    id: link.id,
    purpose,
    label: link.label,
    token: link.token,
    requiresPasscode: Boolean(link.passcode),
    passcode: link.passcode,
    status,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    useCount: link.useCount,
    lastUsedAt: link.lastUsedAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    shareUrl: status === "active" ? shareUrl : null,
    joinUrl: status === "active" && purpose === "live" ? liveUrl : null,
    courseShareUrl:
      status === "active" && purpose === "course" ? courseShareUrl : null,
    embedUrl:
      status === "active" && purpose === "live"
        ? buildJoinUrl(origin, link.token, true)
        : null,
    embedSnippet:
      status === "active" && purpose === "live"
        ? buildEmbedSnippet(origin, link.token)
        : null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;
  if (!(await assertTeacherOwnsCourse(session.userId, courseId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const links = await prisma.courseJoinLink.findMany({
      where: { courseId },
      orderBy: { createdAt: "desc" },
    });
    const origin = request.nextUrl.origin;
    const serializedLinks = links.map((l) => serializeLink(l, origin));
    return NextResponse.json(
      {
        links: serializedLinks,
        liveLinks: serializedLinks.filter((l) => l.purpose === "live"),
        courseShareLinks: serializedLinks.filter((l) => l.purpose === "course"),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Failed to list join links:", error);
    return NextResponse.json(
      { error: "Failed to list join links" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;
  if (!(await assertTeacherOwnsCourse(session.userId, courseId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { roomType: true, passcode: true },
    });
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const purpose: JoinLinkPurpose = isJoinLinkPurpose(body.purpose)
      ? body.purpose
      : "live";
    const defaultPasscode =
      course.roomType === 10 && course.passcode ? course.passcode : null;
    const requirePasscode =
      typeof body.requirePasscode === "boolean"
        ? body.requirePasscode
        : Boolean(defaultPasscode);
    let passcode: string | null = null;
    if (requirePasscode) {
      const candidate =
        typeof body.passcode === "string" && body.passcode.trim()
          ? body.passcode.trim()
          : defaultPasscode || createJoinPasscode();
      if (!isValidJoinPasscode(candidate)) {
        return NextResponse.json(
          { error: "Passcode must be 6 digits" },
          { status: 400 }
        );
      }
      passcode = candidate;
    }
    let expiresAt: Date | null = null;
    if (body.expiresAt) {
      const parsed = new Date(body.expiresAt);
      if (!Number.isNaN(parsed.getTime())) {
        expiresAt = parsed;
      }
    }

    const token = createJoinToken();
    const link = await prisma.courseJoinLink.create({
      data: {
        courseId,
        token,
        purpose,
        passcode,
        label: label || (purpose === "course" ? "课程分享链接" : "直播分享链接"),
        createdBy: session.userId,
        expiresAt,
      },
    });

    const origin = request.nextUrl.origin;
    return NextResponse.json(
      { link: serializeLink(link, origin) },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create join link:", error);
    return NextResponse.json(
      { error: "Failed to create join link" },
      { status: 500 }
    );
  }
}
