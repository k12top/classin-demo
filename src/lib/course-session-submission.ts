import type { CourseSessionStudentSubmission } from "@prisma/client";
import { casdoorUserIdCandidates } from "@/lib/course-teacher";
import {
  getEffectiveSessionRoster,
  rosterContainsUser,
} from "@/lib/course-session-roster";

export const STUDENT_REQUIREMENTS_MAX_LENGTH = 1_000;
export const STUDENT_LEAVE_REASON_MAX_LENGTH = 500;

export type StudentSubmissionSnapshot = {
  requirements: string;
  leaveStatus: "none" | "active" | "withdrawn";
  leaveReason: string;
  leaveRequestedAt: string | null;
  leaveWithdrawnAt: string | null;
  updatedAt: string | null;
};

export function serializeStudentSubmission(
  submission: CourseSessionStudentSubmission | null | undefined,
): StudentSubmissionSnapshot {
  return {
    requirements: submission?.requirements || "",
    leaveStatus:
      submission?.leaveStatus === "active" || submission?.leaveStatus === "withdrawn"
        ? submission.leaveStatus
        : "none",
    leaveReason: submission?.leaveReason || "",
    leaveRequestedAt: submission?.leaveRequestedAt?.toISOString() || null,
    leaveWithdrawnAt: submission?.leaveWithdrawnAt?.toISOString() || null,
    updatedAt: submission?.updatedAt.toISOString() || null,
  };
}

export async function resolveStudentSubmissionMember(
  sessionId: string,
  userId: string,
  userName = "",
) {
  const roster = await getEffectiveSessionRoster(sessionId);
  if (!roster) return { ok: false as const, status: 404, error: "课次不存在" };
  const aliases = Array.from(
    new Set(
      [userId, userName]
        .flatMap(casdoorUserIdCandidates)
        .filter(Boolean),
    ),
  );
  const member = rosterContainsUser(roster, aliases);
  if (!member || member.kind !== "student") {
    return { ok: false as const, status: 403, error: "无权访问该课次" };
  }
  return { ok: true as const, roster, student: member.member };
}

export function sessionAcceptsStudentSubmission(session: {
  status: string;
  endedAt: Date | null;
  endTime: Date;
}, now = new Date()) {
  return (
    !session.endedAt &&
    session.endTime > now &&
    ["scheduled", "live", "afterClass"].includes(session.status)
  );
}
