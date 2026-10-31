"use client";

import { CircleStop, MonitorUp } from "lucide-react";

export function ScreenShareDockButton({
  sharing,
  disabled,
  shareLabel,
  exitLabel,
  activeTitle,
  onShare,
  onStop,
}: {
  sharing: boolean;
  disabled: boolean;
  shareLabel: string;
  exitLabel: string;
  activeTitle: string;
  onShare: () => void;
  onStop: () => void;
}) {
  const label = sharing ? exitLabel : shareLabel;
  const title = sharing ? activeTitle : shareLabel;

  return (
    <button
      type="button"
      disabled={disabled}
      data-dock-action="share"
      data-sharing={sharing || undefined}
      className={`is-dock-secondary ${sharing ? "is-active" : ""}`}
      aria-pressed={sharing}
      aria-label={title}
      title={title}
      onClick={sharing ? onStop : onShare}
    >
      {sharing ? <CircleStop /> : <MonitorUp />}
      {sharing && <i className="classroom-share-live-dot" aria-hidden="true" />}
      <span>{label}</span>
    </button>
  );
}
