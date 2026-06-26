import {
  determineRole,
  getCasdoorRoles,
  searchCasdoorUsers,
  type CasdoorRole,
  type CasdoorUser,
} from "@/lib/casdoor-server";
import { casdoorUserIdsMatch, resolveCasdoorUserId } from "@/lib/casdoor-user";
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

function userReferenceCandidates(user: CasdoorUser): string[] {
  return Array.from(
    new Set(
      [
        user.id,
        user.name,
        user.owner && user.name ? `${user.owner}/${user.name}` : "",
        resolveCasdoorUserId(user),
      ].filter(Boolean)
    )
  );
}

function roleMembershipsByUser(roles: CasdoorRole[]): Map<string, CasdoorRole[]> {
  const memberships = new Map<string, CasdoorRole[]>();
  for (const role of roles) {
    for (const userRef of role.users ?? []) {
      const roleWithoutUsers = {
        name: role.name,
        displayName: role.displayName,
        owner: role.owner,
      };
      const keys = Array.from(
        new Set([
          userRef,
          userRef.includes("/") ? userRef.split("/").pop() || userRef : userRef,
        ])
      );
      for (const key of keys) {
        const existing = memberships.get(key) ?? [];
        existing.push(roleWithoutUsers);
        memberships.set(key, existing);
      }
    }
  }
  return memberships;
}

function rolesForUser(
  user: CasdoorUser,
  memberships: Map<string, CasdoorRole[]>
): CasdoorRole[] {
  const roles = [...(user.roles ?? [])];
  for (const candidate of userReferenceCandidates(user)) {
    for (const role of memberships.get(candidate) ?? []) {
      if (
        !roles.some(
          (existing) =>
            existing.name === role.name &&
            existing.owner === role.owner
        )
      ) {
        roles.push(role);
      }
    }
  }
  return roles;
}

export async function listDirectoryUsers(
  options: ListDirectoryUsersOptions = {}
): Promise<DirectoryUser[]> {
  const limit = normalizeLimit(options.limit);
  const [users, roles] = await Promise.all([
    searchCasdoorUsers(options.query || "", {
      excludeUserId: options.excludeUserId,
      studentsOnly: false,
      limit: options.role ? 1000 : limit,
    }),
    getCasdoorRoles(),
  ]);
  const memberships = roleMembershipsByUser(roles);

  const mappedUsers = users
    .map((user): DirectoryUser => {
      const mergedRoles = rolesForUser(user, memberships);
      const role = determineRole(mergedRoles, user.groups);
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
    .filter((user) => {
      if (options.excludeUserId && casdoorUserIdsMatch(user.id, options.excludeUserId)) {
        return false;
      }
      return !options.role || user.role === options.role;
    })
    .slice(0, limit);

  const avatars = await profileAvatarMap(
    mappedUsers.flatMap((user) => [user.id, user.casdoorUuid || ""])
  );

  return mappedUsers.map((user) => ({
    ...user,
    avatar: avatars.get(user.casdoorUuid || "") ?? avatars.get(user.id) ?? user.avatar,
  }));
}
