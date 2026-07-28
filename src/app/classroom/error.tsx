"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n/context";

export default function ClassroomError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="classroom-v2-shell items-center justify-center gap-4 p-6 text-center">
      <div className="max-w-md rounded-3xl border border-rose-300/20 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-rose-300">
          Classroom interrupted
        </p>
        <h2 className="text-xl font-semibold text-white">
          {t("classroom.v3.classroomInterrupted")}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {error.message || t("classroom.v3.unexpectedError")}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400"
          >
            {t("classroom.v3.retry")}
          </button>
          <Link
            href="/"
            className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            {t("common.backToHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
