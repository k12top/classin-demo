"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The create-course flow is now an inline dialog inside TeacherDashboard.
 * If someone navigates to /courses/create directly, redirect them to the dashboard.
 */
export default function CreateCoursePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-purple-500/20 border-t-purple-500" />
        <p className="text-muted-foreground text-sm">正在跳转…</p>
      </div>
    </div>
  );
}
