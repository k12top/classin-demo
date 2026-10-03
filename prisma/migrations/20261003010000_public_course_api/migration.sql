ALTER TABLE "Course" ADD COLUMN "publicApiManaged" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Course_publicApiManaged_id_idx" ON "Course"("publicApiManaged", "id");
CREATE TABLE "PublicApiRequest" (
  "id" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicApiRequest_pkey" PRIMARY KEY ("id")
);
