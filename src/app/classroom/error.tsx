"use client";

import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";

export default function ClassroomError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();
  const retry = () => {
    if (/loading chunk|chunkloaderror/i.test(error.message)) {
      window.location.reload();
      return;
    }
    reset();
  };

  return (
    <main className="classroom-v3-shell is-error-page">
      <section className="classroom-v3-error-card" role="alert">
        <AlertCircle />
        <small>{t("classroom.v3.unavailableEyebrow")}</small>
        <h1>
          {t("classroom.v3.classroomInterrupted")}
        </h1>
        <p>
          {error.message || t("classroom.v3.unexpectedError")}
        </p>
        <div className="classroom-v3-error-actions">
          <button
            type="button"
            className="is-primary"
            onClick={retry}
          >
            <RefreshCw />
            {t("classroom.v3.retry")}
          </button>
          <button
            type="button"
            onClick={() => window.location.assign("/")}
          >
            <ArrowLeft />
            {t("common.backToHome")}
          </button>
        </div>
      </section>
    </main>
  );
}
