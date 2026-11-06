"use client";

import { useId } from "react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n/context";
import { networkSignalLevel, worseVideoMode } from "@/lib/classroom/network-adaptation";
import type { ClassroomMediaSnapshot } from "@/lib/classroom/types";

export function ClassroomNetworkStatus({ media }: { media: ClassroomMediaSnapshot; sessionId: string }) {
  const { t } = useTranslation();
  const noticeId = useId();
  const connected = media.connectionState === "connected";
  const quality = Math.max(media.network.uplinkQuality, media.network.downlinkQuality);
  const level = connected ? networkSignalLevel(quality) : 0;
  const labelFor = (value: number) => t(`classroomNetwork.${value === 0 ? "checking" : value <= 2 ? "good" : value <= 4 ? "weak" : "poor"}`);
  const label = connected ? labelFor(quality) : t("classroomNetwork.offline");
  const mode = worseVideoMode(media.network.receiveMode ?? "normal", media.network.publishMode ?? "normal");
  const tone = !connected || (level !== null && level <= 1) ? "danger" : mode !== "normal" || (level !== null && level < 4) ? "warning" : level === null ? "unknown" : "good";
  const action = t(`classroomNetwork.${mode === "minimal" ? "paused" : mode === "low" ? "reduced" : "automatic"}`);
  return <div className="classroom-network-status" data-tone={tone} data-video-mode={mode}>
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="classroom-network-trigger" aria-label={`${t("classroomNetwork.title")}：${label}`} aria-describedby={connected && mode !== "normal" ? noticeId : undefined}>
          <svg viewBox="0 0 24 20" aria-hidden="true" focusable="false">
            {[4, 8, 12, 16].map((height, index) => <rect key={height} x={index * 6} y={18 - height} width="4" height={height} rx="1" data-filled={level !== null && index < level} />)}
          </svg>
          <span>{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} collisionPadding={12} className="classroom-header-menu classroom-network-popover">
        <strong>{t("classroomNetwork.title")}</strong>
        <p>{t("classroomNetwork.explanation")}</p>
        <dl>
          <div><dt>{t("classroomNetwork.upload")}</dt><dd>{connected ? labelFor(media.network.uplinkQuality) : t("classroomNetwork.offline")}</dd></div>
          <div><dt>{t("classroomNetwork.download")}</dt><dd>{connected ? labelFor(media.network.downlinkQuality) : t("classroomNetwork.offline")}</dd></div>
          <div><dt>{t("classroomNetwork.latency")}</dt><dd>{connected && media.network.latencyMs !== null ? `${Math.round(media.network.latencyMs)} ms` : "—"}</dd></div>
        </dl>
        <p>{action}</p>
        {media.network.publishMode && media.network.publishMode !== "normal" && <p>{t("classroomNetwork.uploadReduced")}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
    {connected && mode !== "normal" && <div id={noticeId} className="classroom-network-hover-notice" role="tooltip">
      {t(`classroomNetwork.${mode === "minimal" ? "pausedNotice" : "weakNotice"}`)}
    </div>}
  </div>;
}
