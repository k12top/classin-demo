"use client";

import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/context";

export default function CourseShareError({ unstable_retry }: { unstable_retry: () => void }) {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
      <section className="w-full max-w-md rounded-2xl border bg-card p-8 text-center" aria-labelledby="course-share-error-title">
        <AlertCircle aria-hidden="true" className="mx-auto mb-4 h-8 w-8 text-amber-600" />
        <h1 id="course-share-error-title" className="text-xl font-semibold">{t("classroom.launchError")}</h1>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => unstable_retry()}><RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />{t("courseDetail.tryAgain")}</Button>
          <Button asChild variant="outline"><Link href="/">{t("common.backToHome")}</Link></Button>
        </div>
      </section>
    </main>
  );
}
