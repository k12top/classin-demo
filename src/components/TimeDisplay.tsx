"use client";

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

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function TimeDisplay({ isoString, options }: TimeDisplayProps) {
  const mounted = useIsClient();
  const { t, locale } = useTranslation();

  if (!isoString) {
    return <span>{t("common.timeUndetermined")}</span>;
  }

  if (!mounted) {
    return <span className="text-muted-foreground opacity-50">...</span>;
  }

  const defaultOptions: Intl.DateTimeFormatOptions = options || {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  };

  return <span>{formatIsoDate(isoString, locale, defaultOptions)}</span>;
}

export function CourseTimeRangeDisplay({
  startIsoString,
  endIsoString,
}: CourseTimeRangeDisplayProps) {
  const mounted = useIsClient();
  const { t, locale } = useTranslation();

  if (!startIsoString) {
    return <span>{t("common.timeUndetermined")}</span>;
  }

  if (!mounted) {
    return <span className="text-muted-foreground opacity-50">...</span>;
  }

  const fullOptions: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  };
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
  };
  const start = new Date(startIsoString);
  const end = endIsoString ? new Date(endIsoString) : null;
  const canUseCompactEnd =
    end &&
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    isSameLocalDay(start, end);
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
