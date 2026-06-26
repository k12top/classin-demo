import { prisma } from "@/lib/db";

type UserProfileSnapshot = {
  userId: string;
  displayName?: string;
  avatar: string;
  role?: string;
  email?: string;
};

export async function resolveUserAvatar(
  userId: string,
  upstreamAvatar: string
): Promise<string> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { avatar: true },
  });
  return profile ? profile.avatar : upstreamAvatar;
}

export async function upsertUserProfileAvatar(
  profile: UserProfileSnapshot
): Promise<void> {
  await prisma.userProfile.upsert({
    where: { userId: profile.userId },
    update: {
      displayName: profile.displayName || "",
      avatar: profile.avatar,
      role: profile.role || "",
      email: profile.email || "",
    },
    create: {
      userId: profile.userId,
      displayName: profile.displayName || "",
      avatar: profile.avatar,
      role: profile.role || "",
      email: profile.email || "",
    },
  });
}
