import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

export function createJoinToken(): string {
  return randomBytes(24).toString("base64url");
}

export function buildJoinPath(token: string, embed = false): string {
  const path = `/join/${encodeURIComponent(token)}`;
  return embed ? `${path}?embed=1` : path;
}

export function buildJoinUrl(origin: string, token: string, embed = false): string {
  return `${origin.replace(/\/$/, "")}${buildJoinPath(token, embed)}`;
}

export function buildEmbedSnippet(origin: string, token: string): string {
  const src = buildJoinUrl(origin, token, true);
  return `<iframe src="${src}" allow="camera; microphone; display-capture; fullscreen" style="width:100%;height:100vh;border:0" title="灵动课堂"></iframe>`;
}

export type ResolvedJoinLink =
  | { ok: true; courseId: string; linkId: string }
  | { ok: false; reason: "not_found" | "revoked" | "expired" };

export async function resolveJoinLink(token: string): Promise<ResolvedJoinLink> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, reason: "not_found" };
  }

  const link = await prisma.courseJoinLink.findUnique({
    where: { token: trimmed },
    select: { id: true, courseId: true, revokedAt: true, expiresAt: true },
  });

  if (!link) {
    return { ok: false, reason: "not_found" };
  }
  if (link.revokedAt) {
    return { ok: false, reason: "revoked" };
  }
  if (link.expiresAt && link.expiresAt < new Date()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, courseId: link.courseId, linkId: link.id };
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
