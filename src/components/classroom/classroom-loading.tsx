"use client";

import { PageLoadingState } from "@/components/ui/page-loading-state";
import { useTranslation } from "@/lib/i18n/context";

export function ClassroomLoading({
  recorder = false,
  message,
}: {
  recorder?: boolean;
  message?: string;
}) {
  const { t } = useTranslation();

  return (
    <PageLoadingState
      message={
        message ||
        t(
          recorder
            ? "classroom.v3.preparingRecorder"
            : "classroom.v3.entering",
        )
      }
      variant="classroom"
      classroomCopy={{
        brand: t("classroom.v3.loadingBrand"),
        liveLabel: t("classroom.v3.loadingLiveLabel"),
        secureConnection: t("classroom.v3.secureConnection"),
        teachingStage: t("classroom.v3.teachingStage"),
        signalCheck: t("classroom.v3.signalCheck"),
        launchSequence: t("classroom.v3.launchSequence"),
        description: t("classroom.v3.loadingDescription"),
        identityCheck: t("classroom.v3.identityCheck"),
        classroomResources: t("classroom.v3.classroomResources"),
        mediaChannel: t("classroom.v3.mediaChannel"),
        collaboration: t("classroom.v3.classroomCollaboration"),
      }}
    />
  );
}
