"use client";

import { useTimeZone } from "@/lib/use-time-zone";
import { timeZoneLabel } from "@/lib/time-zone";
import { useSyncExternalStore } from "react";
import { useTranslation } from "@/lib/i18n/context";

interface TimeDisplayProps {
  isoString: string | null | undefined;
  options?: Intl.DateTimeFormatOptions;
}

interface CourseTimeRangeDisplayProps {
  startIsoString: string | null | undefined;
  endIsoString: string | null | undefined;
}

function subscribeToClientMount(onStoreChange: () => void) {
  const timeoutId = window.setTimeout(onStoreChange, 0);
  return () => window.clearTimeout(timeoutId);
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

function useIsClient() {
  return useSyncExternalStore(
    subscribeToClientMount,
    getClientSnapshot,
    getServerSnapshot
  );
}

function formatIsoDate(
  isoString: string,
  locale: string,
  options: Intl.DateTimeFormatOptions
): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  try {
    return date.toLocaleString(locale, options);
  } catch (err) {
    console.error("TimeDisplay error:", err);
    return isoString;
  }
}

export default function TimeDisplay({ isoString, options }: TimeDisplayProps) {
  const mounted = useIsClient();
  const { t, locale } = useTranslation();
  const { timeZone } = useTimeZone();

  if (!isoString) {
    return <span>{t("common.timeUndetermined")}</span>;
  }

  if (!mounted) {
    return <span className="text-muted-foreground opacity-50">...</span>;
  }

  const defaultOptions: Intl.DateTimeFormatOptions = options || {
    timeZone,
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  };

  return <span title={Number.isFinite(Date.parse(isoString)) ? timeZoneLabel(timeZone, new Date(isoString)) : undefined}>{formatIsoDate(isoString, locale, { ...defaultOptions, timeZone })}</span>;
}

export function CourseTimeRangeDisplay({
  startIsoString,
  endIsoString,
}: CourseTimeRangeDisplayProps) {
  const mounted = useIsClient();
  const { t, locale } = useTranslation();
  const { timeZone } = useTimeZone();

  if (!startIsoString) {
    return <span>{t("common.timeUndetermined")}</span>;
  }

  if (!mounted) {
    return <span className="text-muted-foreground opacity-50">...</span>;
  }

  const fullOptions: Intl.DateTimeFormatOptions = {
    timeZone,
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  };
  const timeOptions: Intl.DateTimeFormatOptions = {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  };
  const start = new Date(startIsoString);
  const end = endIsoString ? new Date(endIsoString) : null;
  const canUseCompactEnd =
    end &&
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(start) === new Intl.DateTimeFormat("en-CA", { timeZone }).format(end);
  const startLabel = formatIsoDate(startIsoString, locale, fullOptions);
  const endLabel = endIsoString
    ? formatIsoDate(endIsoString, locale, canUseCompactEnd ? timeOptions : fullOptions)
    : null;

  return (
    <span className="block">
      <span className="block">{startLabel}</span>
      {endLabel && (
        <span className="mt-1 block text-xs text-muted-foreground">
          - {endLabel}
        </span>
      )}
    </span>
  );
}
