CREATE TABLE "UserProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL DEFAULT '',
  "avatar" TEXT NOT NULL DEFAULT '',
  "role" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");
CREATE INDEX "UserProfile_role_idx" ON "UserProfile"("role");
