import { determineRole, searchCasdoorUsers } from "@/lib/casdoor-server";
import { resolveCasdoorUserId } from "@/lib/casdoor-user";
import { prisma } from "@/lib/db";

export type DirectoryUserRole = "teacher" | "student";

export type DirectoryUser = {
  id: string;
  casdoorUuid?: string | null;
  name: string;
  displayName: string;
  email: string;
  avatar: string;
  groups: string[];
  role: DirectoryUserRole;
};

type ListDirectoryUsersOptions = {
  query?: string;
  role?: DirectoryUserRole;
  excludeUserId?: string;
  limit?: number;
};

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(Math.trunc(limit || 50), 1), 200);
}

async function profileAvatarMap(userIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return new Map();

  try {
    const profiles = await prisma.userProfile.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, avatar: true },
    });
    return new Map(profiles.map((profile) => [profile.userId, profile.avatar]));
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? (error as { code?: string }).code
      : undefined;
    if (code === "P2021" || code === "P2022") {
      return new Map();
    }
    throw error;
  }
}

export async function listDirectoryUsers(
  options: ListDirectoryUsersOptions = {}
): Promise<DirectoryUser[]> {
  const limit = normalizeLimit(options.limit);
  const users = await searchCasdoorUsers(options.query || "", {
    excludeUserId: options.excludeUserId,
    studentsOnly: false,
    limit: options.role ? Math.max(limit * 4, 100) : limit,
  });

  const mappedUsers = users
    .map((user): DirectoryUser => {
      const role = determineRole(user.roles ?? [], user.groups);
      return {
        id: resolveCasdoorUserId(user),
        casdoorUuid: user.id,
        name: user.name,
        displayName: user.displayName || user.name,
        email: user.email,
        avatar: user.avatar,
        groups: user.groups ?? [],
        role,
      };
    })
    .filter((user) => !options.role || user.role === options.role)
    .slice(0, limit);

  const avatars = await profileAvatarMap(
    mappedUsers.flatMap((user) => [user.id, user.casdoorUuid || ""])
  );

  return mappedUsers.map((user) => ({
    ...user,
    avatar: avatars.get(user.casdoorUuid || "") ?? avatars.get(user.id) ?? user.avatar,
  }));
}
