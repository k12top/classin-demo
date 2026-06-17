"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/context";

interface TimeDisplayProps {
  isoString: string | null | undefined;
  options?: Intl.DateTimeFormatOptions;
}

export default function TimeDisplay({ isoString, options }: TimeDisplayProps) {
  const [mounted, setMounted] = useState(false);
  const { t, locale } = useTranslation();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isoString) {
    return <span>{t("common.timeUndetermined")}</span>;
  }

  if (!mounted) {
    return <span className="text-muted-foreground opacity-50">...</span>;
  }

  try {
    const date = new Date(isoString);
    const defaultOptions: Intl.DateTimeFormatOptions = options || {
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    };
    return <span>{date.toLocaleString(locale, defaultOptions)}</span>;
  } catch (err) {
    console.error("TimeDisplay error:", err);
    return <span>{isoString}</span>;
  }
}
