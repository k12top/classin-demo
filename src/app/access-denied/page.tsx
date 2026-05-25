"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AccessDeniedView } from "@/components/AccessDeniedView";
import type { CourseAccessDeniedCode } from "@/lib/access-denied-codes";

function AccessDeniedContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason") || undefined;
  const courseName = searchParams.get("course") || undefined;
  const courseId = searchParams.get("courseId") || undefined;
  const code = searchParams.get("code") as CourseAccessDeniedCode | null;

  return (
    <AccessDeniedView
      code={code}
      reason={reason}
      courseName={courseName}
      courseId={courseId}
    />
  );
}

export default function AccessDeniedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-muted-foreground">加载中…</p>
        </div>
      }
    >
      <AccessDeniedContent />
    </Suspense>
  );
}
