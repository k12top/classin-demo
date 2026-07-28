import { Suspense } from "react";
import ClassroomV2 from "@/components/classroom/classroom-v2";
import { ClassroomV3 } from "@/components/classroom/classroom-v3";
import { ClassroomLoading } from "@/components/classroom/classroom-loading";

type ClassroomPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function stringParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function stableRolloutBucket(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

function shouldUseV3(courseId: string): boolean {
  const version = (process.env.CLASSROOM_UI_VERSION || "v3").toLowerCase();
  if (version === "v2") return false;
  if (version !== "rollout") return true;

  const parsed = Number(process.env.CLASSROOM_V3_ROLLOUT_PERCENT || "0");
  const percentage = Number.isFinite(parsed)
    ? Math.max(0, Math.min(100, Math.round(parsed)))
    : 0;
  return stableRolloutBucket(courseId || "anonymous") < percentage;
}

export default async function ClassroomPage({
  searchParams,
}: ClassroomPageProps) {
  const params = await searchParams;
  const courseId = stringParam(params.courseId);

  if (!shouldUseV3(courseId)) return <ClassroomV2 />;

  return (
    <Suspense fallback={<ClassroomLoading />}>
      <ClassroomV3 />
    </Suspense>
  );
}
