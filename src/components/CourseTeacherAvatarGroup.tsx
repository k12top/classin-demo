"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type CourseTeacherAvatarItem = {
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string;
};

type CourseTeacherAvatarGroupProps = {
  leadTeacher: CourseTeacherAvatarItem;
  teachers?: CourseTeacherAvatarItem[];
  leadLabel: string;
  className?: string;
};

function idsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const strip = (value: string) =>
    value.includes("/") ? value.split("/").pop() || value : value;
  return strip(a) === strip(b);
}

function teacherInitial(teacher: CourseTeacherAvatarItem): string {
  return (teacher.teacherName || teacher.teacherId || "T")
    .trim()
    .slice(0, 1)
    .toUpperCase();
}

function normalizeTeachers(
  leadTeacher: CourseTeacherAvatarItem,
  teachers: CourseTeacherAvatarItem[] = []
): CourseTeacherAvatarItem[] {
  const normalized: CourseTeacherAvatarItem[] = [];
  const add = (teacher: CourseTeacherAvatarItem) => {
    const teacherId = teacher.teacherId?.trim();
    if (!teacherId) return;
    const existing = normalized.find((item) => idsMatch(item.teacherId, teacherId));
    if (existing) {
      if (!existing.teacherName && teacher.teacherName) {
        existing.teacherName = teacher.teacherName;
      }
      if (!existing.teacherAvatar && teacher.teacherAvatar) {
        existing.teacherAvatar = teacher.teacherAvatar;
      }
      return;
    }
    normalized.push({
      teacherId,
      teacherName: teacher.teacherName || teacherId,
      teacherAvatar: teacher.teacherAvatar || "",
    });
  };

  add(leadTeacher);
  for (const teacher of teachers) add(teacher);
  return normalized;
}

export function CourseTeacherAvatarGroup({
  leadTeacher,
  teachers,
  leadLabel,
  className = "",
}: CourseTeacherAvatarGroupProps) {
  const normalized = normalizeTeachers(leadTeacher, teachers);
  const lead =
    normalized.find((teacher) => idsMatch(teacher.teacherId, leadTeacher.teacherId)) ||
    normalized[0] ||
    leadTeacher;
  const others = normalized.filter((teacher) => !idsMatch(teacher.teacherId, lead.teacherId));
  const title = normalized.map((teacher) => teacher.teacherName || teacher.teacherId).join(", ");

  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-2 ${className}`}
      title={title}
      aria-label={title}
    >
      <div className="flex min-w-0 items-center gap-2 rounded-full border border-primary/15 bg-primary/5 py-1 pl-1 pr-3 text-primary">
        <div className="relative shrink-0">
          <Avatar className="h-10 w-10 border-2 border-card shadow-sm">
            <AvatarImage src={lead.teacherAvatar || ""} />
            <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
              {teacherInitial(lead)}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-1 -right-2 rounded-full border border-card bg-primary px-1.5 py-0.5 text-[9px] font-bold leading-none text-primary-foreground shadow-sm">
            {leadLabel}
          </span>
        </div>
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
          {lead.teacherName}
        </span>
      </div>

      {others.map((teacher) => (
        <div
          key={teacher.teacherId}
          className="flex min-w-0 items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 py-1 pl-1 pr-2.5 text-muted-foreground"
        >
          <Avatar className="h-7 w-7 border border-card">
            <AvatarImage src={teacher.teacherAvatar || ""} />
            <AvatarFallback className="bg-muted text-[11px] font-semibold text-foreground/70">
              {teacherInitial(teacher)}
            </AvatarFallback>
          </Avatar>
          <span className="max-w-[8rem] truncate text-xs font-medium text-foreground/80">
            {teacher.teacherName}
          </span>
        </div>
      ))}
    </div>
  );
}
