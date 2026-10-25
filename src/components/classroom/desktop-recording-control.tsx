"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { FileVideo, Loader2, Radio } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";

const subscribeDesktop = () => () => undefined;
const desktopSnapshot = () => Boolean(window.classroomDesktop?.openLocalRecordings);
const serverDesktopSnapshot = () => false;

export function DesktopRecordingControl({ sessionId, title, menuItem = false, onError }: {
  sessionId: string;
  title: string;
  menuItem?: boolean;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, serverDesktopSnapshot);
  const [status, setStatus] = useState("idle");
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    const api = window.classroomDesktop;
    if (!api?.openLocalRecordings) return;
    return api.onLocalRecordingState(({ status: next }) => setStatus(next));
  }, []);
  if (!desktop) return null;
  const active = ["recording", "paused", "stopping"].includes(status);
  const label = t(status === "paused" ? "classroomMinimal.localRecordingPaused" : active ? "classroomMinimal.localRecordingActive" : "classroomMinimal.localRecording");
  return <button type="button" role={menuItem ? "menuitem" : undefined}
    className={menuItem ? undefined : `is-dock-secondary ${active ? "is-recording" : ""}`}
    disabled={opening} aria-busy={opening} title={label}
    onClick={() => {
      setOpening(true);
      void window.classroomDesktop?.openLocalRecordings({ sessionId, title })
        .catch((error: unknown) => onError(error instanceof Error ? error.message : t("classroomMinimal.localRecordingFailed")))
        .finally(() => setOpening(false));
    }}>
    {opening ? <Loader2 /> : active ? <Radio /> : <FileVideo />}<span>{label}</span>
  </button>;
}
