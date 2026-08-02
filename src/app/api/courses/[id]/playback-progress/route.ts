import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { prisma } from "@/lib/db";
import {
  calculatePlaybackCreditSec,
  formatPlaybackDuration,
  isFinitePlaybackPosition,
  normalizePlaybackRate,
  playbackProgressPolicy,
} from "@/lib/playback-progress";
import { isHlsPlaybackUrl, isMp4PlaybackUrl } from "@/lib/playback-url";
import { getSessionFromRequest } from "@/lib/session";
import { userCanTeachCourse } from "@/lib/course-teacher";

export const dynamic = "force-dynamic";

const ACTIVE_STATES = new Set(["playing", "paused", "waiting", "seeking", "hidden", "ended"]);

function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
  });
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function issueChallenge(): { plain: string; hash: string } {
  const plain = randomBytes(32).toString("base64url");
  return { plain, hash: hashChallenge(plain) };
}

function hashChallenge(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function challengeMatches(candidate: string, expectedHash: string | null): boolean {
  if (!candidate || !expectedHash) return false;
  const candidateHash = Buffer.from(hashChallenge(candidate), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return candidateHash.length === expected.length && timingSafeEqual(candidateHash, expected);
}

/** Browser-origin checks are defense in depth; auth, rotating challenges and server time remain authoritative. */
function isSameOriginBrowserMutation(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;

  try {
    const originUrl = new URL(origin);
    const expectedHost =
      request.headers.get("x-forwarded-host") || request.headers.get("host");
    return Boolean(expectedHost && originUrl.host === expectedHost);
  } catch {
    return false;
  }
}

async function getCourseAccess(courseId: string, userIds: string[]) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      name: true,
      status: true,
      recordUrl: true,
      roomType: true,
      passcode: true,
      ownerId: true,
      teacherId: true,
      teachers: { select: { teacherId: true } },
      students: { select: { studentId: true } },
      groupLinks: {
        select: {
          group: { select: { members: { select: { userId: true } } } },
        },
      },
    },
  });
  if (!course) return null;

  const teacher = userCanTeachCourse(course, userIds);
  const directStudent = course.students.some((student) =>
    userIds.some((userId) => casdoorUserIdsMatch(student.studentId, userId))
  );
  const groupStudent = course.groupLinks.some((link) =>
    link.group.members.some((member) =>
      userIds.some((userId) => casdoorUserIdsMatch(member.userId, userId))
    )
  );
  const openPublicCourse = course.roomType === 10 && !course.passcode;

  return {
    course,
    teacher,
    student: directStudent || groupStudent || openPublicCourse,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) return noStoreJson({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getCourseAccess(id, [session.userId, session.name]);
  if (!access) return noStoreJson({ error: "Course not found" }, { status: 404 });
  if (!access.teacher) return noStoreJson({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.coursePlaybackProgress.findMany({
    where: { courseId: id },
    orderBy: [{ lastViewedAt: "desc" }, { studentName: "asc" }],
  });
  const now = Date.now();
  const playback = rows.map((row) => ({
    studentId: row.studentId,
    studentName: row.studentName,
    studentAvatar: row.studentAvatar,
    sessionCount: row.sessionCount,
    firstViewedAt: row.firstViewedAt,
    lastViewedAt: row.lastViewedAt,
    totalDurationSec: row.totalDurationSec,
    active:
      row.lastPlaybackState === "playing" &&
      Boolean(row.activeSessionId) &&
      Boolean(
        row.lastHeartbeatAt &&
          now - row.lastHeartbeatAt.getTime() <= playbackProgressPolicy.activeWindowMs
      ),
  }));

  if (request.nextUrl.searchParams.get("format") === "csv") {
    const header = [
      "studentId",
      "studentName",
      "sessionCount",
      "firstViewedAt",
      "lastViewedAt",
      "totalDurationSec",
      "totalDuration",
      "active",
    ];
    const lines = [
      header.map(csvEscape).join(","),
      ...playback.map((row) =>
        [
          row.studentId,
          row.studentName,
          row.sessionCount,
          row.firstViewedAt.toISOString(),
          row.lastViewedAt.toISOString(),
          row.totalDurationSec,
          formatPlaybackDuration(row.totalDurationSec),
          row.active,
        ]
          .map(csvEscape)
          .join(",")
      ),
    ];
    return new NextResponse(`\uFEFF${lines.join("\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="playback-progress-${id}.csv"`,
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    });
  }

  return noStoreJson({
    playback: playback.map((row) => ({
      ...row,
      firstViewedAt: row.firstViewedAt.toISOString(),
      lastViewedAt: row.lastViewedAt.toISOString(),
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSameOriginBrowserMutation(request)) {
    return noStoreJson({ error: "Invalid request origin" }, { status: 403 });
  }
  const session = await getSessionFromRequest(request);
  if (!session) return noStoreJson({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getCourseAccess(id, [session.userId, session.name]);
  if (!access) return noStoreJson({ error: "Course not found" }, { status: 404 });
  if (access.teacher) return noStoreJson({ tracked: false, reason: "teacher_preview" });
  if (!access.student) return noStoreJson({ error: "Forbidden" }, { status: 403 });
  if (
    access.course.status !== "finished" ||
    (!isMp4PlaybackUrl(access.course.recordUrl) && !isHlsPlaybackUrl(access.course.recordUrl))
  ) {
    return noStoreJson({ error: "Playback is not trackable" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  if (!isFinitePlaybackPosition(body.positionSec)) {
    return noStoreJson({ error: "Invalid playback position" }, { status: 400 });
  }
  const playbackRate = normalizePlaybackRate(body.playbackRate);
  if (playbackRate === null) {
    return noStoreJson({ error: "Unsupported playback rate" }, { status: 400 });
  }

  const now = new Date();
  const activeSessionId = randomUUID();
  const challenge = issueChallenge();
  const studentName = session.displayName || session.name || session.userId;
  const progress = await prisma.coursePlaybackProgress.upsert({
    where: { courseId_studentId: { courseId: id, studentId: session.userId } },
    create: {
      courseId: id,
      studentId: session.userId,
      studentName,
      studentAvatar: session.avatar || "",
      firstViewedAt: now,
      lastViewedAt: now,
      sessionCount: 1,
      activeSessionId,
      heartbeatNonceHash: challenge.hash,
      lastHeartbeatAt: now,
      lastPositionSec: body.positionSec,
      lastPlaybackRate: playbackRate,
      lastPlaybackState: "playing",
    },
    update: {
      studentName,
      studentAvatar: session.avatar || "",
      lastViewedAt: now,
      sessionCount: { increment: 1 },
      activeSessionId,
      heartbeatNonceHash: challenge.hash,
      lastHeartbeatAt: now,
      lastPositionSec: body.positionSec,
      lastPlaybackRate: playbackRate,
      lastPlaybackState: "playing",
    },
  });

  return noStoreJson({
    tracked: true,
    sessionId: activeSessionId,
    challenge: challenge.plain,
    heartbeatIntervalMs: playbackProgressPolicy.heartbeatIntervalMs,
    totalDurationSec: progress.totalDurationSec,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSameOriginBrowserMutation(request)) {
    return noStoreJson({ error: "Invalid request origin" }, { status: 403 });
  }
  const session = await getSessionFromRequest(request);
  if (!session) return noStoreJson({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const playbackRate = normalizePlaybackRate(body.playbackRate);
  if (
    typeof body.sessionId !== "string" ||
    typeof body.challenge !== "string" ||
    !ACTIVE_STATES.has(body.state) ||
    typeof body.activeWindow !== "boolean" ||
    !isFinitePlaybackPosition(body.positionSec) ||
    playbackRate === null
  ) {
    return noStoreJson({ error: "Invalid heartbeat" }, { status: 400 });
  }

  const access = await getCourseAccess(id, [session.userId, session.name]);
  if (!access) return noStoreJson({ error: "Course not found" }, { status: 404 });
  if (access.teacher || !access.student) {
    return noStoreJson({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const progress = await prisma.coursePlaybackProgress.findUnique({
    where: { courseId_studentId: { courseId: id, studentId: session.userId } },
  });
  if (
    !progress ||
    progress.activeSessionId !== body.sessionId ||
    !challengeMatches(body.challenge, progress.heartbeatNonceHash) ||
    !progress.lastHeartbeatAt
  ) {
    return noStoreJson({ error: "Playback session expired" }, { status: 409 });
  }

  const elapsedMs = now.getTime() - progress.lastHeartbeatAt.getTime();
  const terminal = body.state !== "playing";
  if (elapsedMs < playbackProgressPolicy.minimumHeartbeatGapMs && !terminal) {
    return noStoreJson({
      tracked: true,
      creditedSec: 0,
      totalDurationSec: progress.totalDurationSec,
      challenge: body.challenge,
      tooSoon: true,
    });
  }

  const creditedSec = calculatePlaybackCreditSec({
    elapsedMs,
    previousPositionSec: progress.lastPositionSec,
    currentPositionSec: body.positionSec,
    playbackRate: progress.lastPlaybackRate ?? playbackRate,
    previousState: progress.lastPlaybackState,
    activeWindow: body.activeWindow,
  });
  const nextChallenge = terminal ? null : issueChallenge();
  const updated = await prisma.coursePlaybackProgress.updateMany({
    where: {
      id: progress.id,
      activeSessionId: body.sessionId,
      heartbeatNonceHash: progress.heartbeatNonceHash,
    },
    data: {
      totalDurationSec: { increment: creditedSec },
      lastViewedAt: now,
      lastHeartbeatAt: now,
      lastPositionSec: body.positionSec,
      lastPlaybackRate: playbackRate,
      lastPlaybackState: body.state,
      activeSessionId: terminal ? null : body.sessionId,
      heartbeatNonceHash: nextChallenge?.hash ?? null,
    },
  });
  if (updated.count !== 1) {
    return noStoreJson({ error: "Playback session expired" }, { status: 409 });
  }

  return noStoreJson({
    tracked: true,
    creditedSec,
    totalDurationSec: progress.totalDurationSec + creditedSec,
    challenge: nextChallenge?.plain ?? null,
    active: !terminal,
  });
}
