import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

export const JOIN_LINK_PURPOSES = ["live", "course"] as const;
export type JoinLinkPurpose = (typeof JOIN_LINK_PURPOSES)[number];
const SHARE_ACCESS_TTL_SECONDS = 2 * 60 * 60;

type ShareAccessPayload = {
  userId: string;
  courseId: string;
  linkId: string;
  purpose: "live";
  exp: number;
};

export function createJoinToken(): string {
  return randomBytes(24).toString("base64url");
}

export function createJoinPasscode(): string {
  return randomInt(100000, 1000000).toString();
}

export function isValidJoinPasscode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export function passcodesMatch(expected: string, actual: string): boolean {
  if (!isValidJoinPasscode(expected) || !isValidJoinPasscode(actual)) {
    return false;
  }
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export function isJoinLinkPurpose(value: unknown): value is JoinLinkPurpose {
  return (
    typeof value === "string" &&
    (JOIN_LINK_PURPOSES as readonly string[]).includes(value)
  );
}

export function buildJoinPath(token: string, embed = false, lang?: string): string {
  const path = `/join/${encodeURIComponent(token)}`;
  const qs = new URLSearchParams();
  if (embed) qs.set("embed", "1");
  if (lang) qs.set("lang", lang);
  return qs.size > 0 ? `${path}?${qs.toString()}` : path;
}

export function buildJoinUrl(origin: string, token: string, embed = false, lang?: string): string {
  return `${origin.replace(/\/$/, "")}${buildJoinPath(token, embed, lang)}`;
}

export function buildCourseSharePath(token: string, lang?: string): string {
  const path = `/course-share/${encodeURIComponent(token)}`;
  const qs = new URLSearchParams();
  if (lang) qs.set("lang", lang);
  return qs.size > 0 ? `${path}?${qs.toString()}` : path;
}

export function buildCourseShareUrl(origin: string, token: string, lang?: string): string {
  return `${origin.replace(/\/$/, "")}${buildCourseSharePath(token, lang)}`;
}

export function buildEmbedSnippet(origin: string, token: string, lang?: string): string {
  const src = buildJoinUrl(origin, token, true, lang);
  return `<iframe src="${src}" allow="camera; microphone; display-capture; fullscreen" style="width:100%;height:100vh;border:0" title="在线课堂"></iframe>`;
}

export type ResolvedJoinLink =
  | { ok: true; courseId: string; linkId: string; requiresPasscode: boolean }
  | { ok: false; reason: "not_found" | "revoked" | "expired" };

export async function resolveJoinLink(token: string): Promise<ResolvedJoinLink> {
  return resolveJoinLinkForPurpose(token, "live");
}

export async function resolveJoinLinkForPurpose(
  token: string,
  purpose: JoinLinkPurpose
): Promise<ResolvedJoinLink> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, reason: "not_found" };
  }

  const link = await prisma.courseJoinLink.findUnique({
    where: { token: trimmed },
    select: {
      id: true,
      courseId: true,
      purpose: true,
      passcode: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!link) {
    return { ok: false, reason: "not_found" };
  }
  if (link.purpose !== purpose) {
    return { ok: false, reason: "not_found" };
  }
  if (link.revokedAt) {
    return { ok: false, reason: "revoked" };
  }
  if (link.expiresAt && link.expiresAt < new Date()) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    courseId: link.courseId,
    linkId: link.id,
    requiresPasscode: Boolean(link.passcode),
  };
}

export async function recordJoinLinkUse(linkId: string): Promise<void> {
  await prisma.courseJoinLink.update({
    where: { id: linkId },
    data: {
      useCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });
}

export function joinLinkStatus(link: {
  revokedAt: Date | null;
  expiresAt: Date | null;
}): "active" | "revoked" | "expired" {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt && link.expiresAt < new Date()) return "expired";
  return "active";
}

function shareAccessSecret(): string {
  return (
    process.env.SHARE_ACCESS_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    "fallback-secret-change-me-in-production-32chars!"
  );
}

function signShareAccessPayload(payload: string): string {
  return createHmac("sha256", shareAccessSecret())
    .update(payload)
    .digest("base64url");
}

export function createShareAccessToken(input: {
  userId: string;
  courseId: string;
  linkId: string;
}): string {
  const payload: ShareAccessPayload = {
    userId: input.userId,
    courseId: input.courseId,
    linkId: input.linkId,
    purpose: "live",
    exp: Math.floor(Date.now() / 1000) + SHARE_ACCESS_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signShareAccessPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function parseShareAccessToken(token: string): ShareAccessPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signShareAccessPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as Partial<ShareAccessPayload>;
    if (
      payload.purpose !== "live" ||
      typeof payload.userId !== "string" ||
      typeof payload.courseId !== "string" ||
      typeof payload.linkId !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload as ShareAccessPayload;
  } catch {
    return null;
  }
}

export async function verifyShareAccessToken(
  token: string | null | undefined,
  expected: { userId: string; courseId: string }
): Promise<{ ok: true; linkId: string } | { ok: false }> {
  const trimmed = token?.trim();
  if (!trimmed) return { ok: false };

  const payload = parseShareAccessToken(trimmed);
  if (
    !payload ||
    payload.userId !== expected.userId ||
    payload.courseId !== expected.courseId
  ) {
    return { ok: false };
  }

  const link = await prisma.courseJoinLink.findFirst({
    where: {
      id: payload.linkId,
      courseId: expected.courseId,
      purpose: "live",
    },
    select: {
      id: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!link || joinLinkStatus(link) !== "active") {
    return { ok: false };
  }

  return { ok: true, linkId: link.id };
}
