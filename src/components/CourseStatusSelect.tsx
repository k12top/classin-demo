"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CourseStatus } from "@/lib/course-status";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const COURSE_STATUS_OPTIONS = [
  {
    value: CourseStatus.SCHEDULED,
    labelKey: "courseDetail.classroomStatusNotStarted",
  },
  {
    value: CourseStatus.LIVE,
    labelKey: "courseDetail.classroomStatusActive",
  },
  {
    value: CourseStatus.AFTER_CLASS,
    labelKey: "courseDetail.classroomStatusAfterClass",
  },
  {
    value: CourseStatus.FINISHED,
    labelKey: "courseDetail.classroomStatusFinished",
  },
  {
    value: CourseStatus.CANCELLED,
    labelKey: "courseDetail.classroomStatusCancelled",
  },
] as const;

type TranslationFn = (
  key: string,
  replacements?: Record<string, string | number>
) => string;

export function getCourseStatusLabel(t: TranslationFn, status: string): string {
  const option = COURSE_STATUS_OPTIONS.find((item) => item.value === status);
  return option ? t(option.labelKey) : status;
}

type CourseStatusSelectProps = {
  value: string;
  onValueChange: (status: string) => void;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
};

export function CourseStatusSelect({
  value,
  onValueChange,
  disabled,
  className,
  triggerClassName,
}: CourseStatusSelectProps) {
  const { t } = useTranslation();
  const ariaLabel = t("courseDetail.courseClassroomStatus");

  return (
    <div className={cn("min-w-[8.75rem]", className)}>
      <Select
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <SelectTrigger
          aria-label={ariaLabel}
          className={cn(
            "h-8 rounded-lg bg-card px-2.5 text-xs font-medium",
            triggerClassName
          )}
        >
          <SelectValue placeholder={ariaLabel} />
        </SelectTrigger>
        <SelectContent>
          {COURSE_STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {t(option.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
