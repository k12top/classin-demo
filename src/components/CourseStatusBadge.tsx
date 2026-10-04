"use client";

import { Badge } from "@/components/ui/badge";
import { statusBadgeClassName, statusLabel } from "@/lib/course-status";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type CourseStatusBadgeProps = {
  status: string;
  className?: string;
};

export function CourseStatusBadge({ status, className }: CourseStatusBadgeProps) {
  const { t } = useTranslation();
  const translated = t(`courseSessions.status.${status}`);
  return (
    <Badge
      variant="outline"
      className={cn(statusBadgeClassName(status), className)}
    >
      {translated === `courseSessions.status.${status}`
        ? statusLabel(status)
        : translated}
    </Badge>
  );
}
