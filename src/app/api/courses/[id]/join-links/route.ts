/**
 * Course share / join links (teacher only)
 * GET  /api/courses/:id/join-links — list
 * POST /api/courses/:id/join-links — create
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { assertTeacherOwnsCourse } from "@/lib/course-teacher";
import {
  buildEmbedSnippet,
  buildJoinUrl,
  createJoinToken,
  joinLinkStatus,
} from "@/lib/join-link";

function serializeLink(
  link: {
    id: string;
    token: string;
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
  return {
    id: link.id,
    label: link.label,
    token: link.token,
    status,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    useCount: link.useCount,
    lastUsedAt: link.lastUsedAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    joinUrl: status === "active" ? buildJoinUrl(origin, link.token) : null,
    embedUrl:
      status === "active" ? buildJoinUrl(origin, link.token, true) : null,
    embedSnippet:
      status === "active" ? buildEmbedSnippet(origin, link.token) : null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
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
    return NextResponse.json({
      links: links.map((l) => serializeLink(l, origin)),
    });
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
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;
  if (!(await assertTeacherOwnsCourse(session.userId, courseId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const label = typeof body.label === "string" ? body.label.trim() : "";
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
        label: label || "直播分享链接",
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
