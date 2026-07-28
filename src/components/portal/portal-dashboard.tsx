"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  DoorOpen,
  GraduationCap,
  Loader2,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { canEnterClassroom } from "@/lib/course-status";
import { useTranslation } from "@/lib/i18n/context";
import styles from "./portal-dashboard.module.css";

export type PortalCourse = {
  id: string;
  name: string;
  description?: string;
  roomType: number;
  status: string;
  startTime: string | null;
  endTime: string | null;
  teacherName: string;
  canTeach?: boolean;
  students?: Array<unknown>;
};

type DashboardProps = {
  role: "teacher" | "student";
  courses: PortalCourse[];
  enteringCourseId?: string | null;
  onEnter: (course: PortalCourse) => void;
  onOpen: (course: PortalCourse) => void;
  onCreate?: () => void;
};

type PortalSectionHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  metric?: {
    value: string | number;
    label: string;
  };
};

export function PortalSectionHeader({
  eyebrow,
  title,
  description,
  metric,
}: PortalSectionHeaderProps) {
  return (
    <header className={styles.sectionLead}>
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {metric ? (
        <div className={styles.sectionMetric}>
          <strong>{metric.value}</strong>
          <small>{metric.label}</small>
        </div>
      ) : null}
    </header>
  );
}

function copyFor(t: ReturnType<typeof useTranslation>["t"]) {
  return {
    command: t("portal.command"),
    next: t("portal.next"),
    noNext: t("portal.noNext"),
    noNextDesc: t("portal.noNextDescription"),
    enter: t("portal.enter"),
    details: t("portal.details"),
    create: t("portal.create"),
    countdown: t("portal.countdown"),
    live: t("portal.live"),
    ended: t("portal.ended"),
    todayCount: t("portal.todayCount"),
    liveCount: t("portal.liveCount"),
    totalCount: t("portal.totalCount"),
    timeline: t("portal.timeline"),
    timelineHint: t("portal.timelineHint"),
    emptyTimeline: t("portal.emptyTimeline"),
    library: t("portal.library"),
    libraryDesc: t("portal.libraryDescription"),
    search: t("portal.search"),
    all: t("portal.all"),
    upcoming: t("portal.upcoming"),
    finished: t("portal.finished"),
    cancelled: t("portal.cancelled"),
    noCourses: t("portal.noCourses"),
    noCoursesHint: t("portal.noCoursesHint"),
    teacher: t("portal.teacher"),
    publicClass: t("portal.publicClass"),
    bigClass: t("portal.bigClass"),
    smallClass: t("portal.smallClass"),
    oneToOne: t("portal.oneToOne"),
    ready: t("portal.ready"),
    liveNow: t("portal.liveNow"),
    status: {
      scheduled: t("courseDetail.classroomStatusNotStarted"),
      live: t("courseDetail.classroomStatusActive"),
      afterClass: t("courseDetail.classroomStatusAfterClass"),
      finished: t("courseDetail.classroomStatusFinished"),
      cancelled: t("courseDetail.classroomStatusCancelled"),
    } as Record<string, string>,
  };
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function roomTypeLabel(roomType: number, copy: ReturnType<typeof copyFor>) {
  if (roomType === 10) return copy.publicClass;
  if (roomType === 2) return copy.bigClass;
  if (roomType === 4) return copy.smallClass;
  return copy.oneToOne;
}

function getNextCourse(courses: PortalCourse[], now: Date) {
  const live = courses.find((course) => course.status === "live");
  if (live) return live;
  return [...courses]
    .filter(
      (course) =>
        course.startTime &&
        ["scheduled", "afterClass"].includes(course.status) &&
        new Date(course.startTime).getTime() >= now.getTime() - 30 * 60_000,
    )
    .sort(
      (left, right) =>
        new Date(left.startTime || 0).getTime() -
        new Date(right.startTime || 0).getTime(),
    )[0];
}

function countdownLabel(
  course: PortalCourse | undefined,
  now: Date,
  copy: ReturnType<typeof copyFor>,
) {
  if (!course) return "—";
  if (course.status === "live") return copy.liveNow;
  if (!course.startTime) return "—";
  const diff = new Date(course.startTime).getTime() - now.getTime();
  if (diff <= 0) return copy.ready;
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.max(0, Math.floor((diff % 3_600_000) / 60_000));
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function PortalDashboardHero({
  role,
  courses,
  enteringCourseId,
  onEnter,
  onOpen,
  onCreate,
}: DashboardProps) {
  const { locale, t } = useTranslation();
  const copy = copyFor(t);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const todayCourses = useMemo(
    () =>
      courses
        .filter(
          (course) =>
            course.startTime && sameDay(new Date(course.startTime), now),
        )
        .sort(
          (left, right) =>
            new Date(left.startTime || 0).getTime() -
            new Date(right.startTime || 0).getTime(),
        ),
    [courses, now],
  );
  const nextCourse = getNextCourse(courses, now);
  const nextTime = nextCourse?.startTime
    ? new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(nextCourse.startTime))
    : "";

  return (
    <div className={styles.stack}>
      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <div>
            <div className={styles.eyebrow}>
              <i aria-hidden="true" />
              {copy.command}
            </div>
            <h2 className={styles.heroTitle}>
              {nextCourse?.name || copy.noNext}
            </h2>
            <div className={styles.heroMeta}>
              {nextCourse ? (
                <>
                  <span>
                    <CalendarClock aria-hidden="true" />
                    {nextTime}
                  </span>
                  <span>
                    <GraduationCap aria-hidden="true" />
                    {nextCourse.teacherName}
                  </span>
                  <span>
                    <Users aria-hidden="true" />
                    {roomTypeLabel(nextCourse.roomType, copy)}
                  </span>
                </>
              ) : (
                <span>{copy.noNextDesc}</span>
              )}
            </div>
          </div>
          <div className={styles.heroActions}>
            {nextCourse ? (
              <>
                <button
                  type="button"
                  className={styles.heroAction}
                  disabled={
                    enteringCourseId === nextCourse.id ||
                    !canEnterClassroom(nextCourse.status)
                  }
                  onClick={() => onEnter(nextCourse)}
                >
                  {enteringCourseId === nextCourse.id ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <DoorOpen aria-hidden="true" />
                  )}
                  {copy.enter}
                </button>
                <button
                  type="button"
                  className={styles.heroSecondary}
                  onClick={() => onOpen(nextCourse)}
                >
                  {copy.details}
                  <ArrowRight aria-hidden="true" />
                </button>
              </>
            ) : null}
            {role === "teacher" && onCreate ? (
              <button
                type="button"
                className={styles.heroSecondary}
                onClick={onCreate}
              >
                <Plus aria-hidden="true" />
                {copy.create}
              </button>
            ) : null}
          </div>
        </div>

        <aside className={styles.heroSide}>
          <div className={styles.countdown}>
            <small>
              {nextCourse?.status === "live" ? copy.live : copy.countdown}
            </small>
            <strong>{countdownLabel(nextCourse, now, copy)}</strong>
            <p>
              {nextCourse
                ? copy.status[nextCourse.status] || nextCourse.status
                : copy.noNextDesc}
            </p>
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <small>{copy.todayCount}</small>
              <strong>{todayCourses.length}</strong>
            </div>
            <div className={styles.stat}>
              <small>{copy.liveCount}</small>
              <strong>
                {courses.filter((course) => course.status === "live").length}
              </strong>
            </div>
            <div className={styles.stat}>
              <small>{copy.totalCount}</small>
              <strong>{courses.length}</strong>
            </div>
            <div className={styles.stat}>
              <small>{role === "teacher" ? copy.teacher : copy.upcoming}</small>
              <strong>
                {
                  courses.filter((course) =>
                    role === "teacher"
                      ? course.canTeach !== false
                      : course.status === "scheduled",
                  ).length
                }
              </strong>
            </div>
          </div>
        </aside>
      </section>

      <section className={styles.rail}>
        <div className={styles.railHeader}>
          <h2>{copy.timeline}</h2>
          <span>{copy.timelineHint}</span>
        </div>
        <div className={styles.railTrack}>
          {todayCourses.length ? (
            todayCourses.map((course) => (
              <button
                key={course.id}
                type="button"
                className={styles.railCard}
                data-live={course.status === "live"}
                onClick={() => onOpen(course)}
              >
                <span className={styles.railTime}>
                  {course.startTime
                    ? new Intl.DateTimeFormat(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      }).format(new Date(course.startTime))
                    : "TBD"}
                </span>
                <span className={styles.railCopy}>
                  <strong>{course.name}</strong>
                  <small>
                    {copy.status[course.status] || course.status} ·{" "}
                    {course.teacherName}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <div className={styles.emptyRail}>{copy.emptyTimeline}</div>
          )}
        </div>
      </section>
    </div>
  );
}

export function PortalCourseLibrary({
  courses,
  enteringCourseId,
  onEnter,
  onOpen,
}: Omit<DashboardProps, "role" | "onCreate">) {
  const { locale, t } = useTranslation();
  const copy = copyFor(t);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return courses.filter((course) => {
      const searchMatches =
        !normalizedQuery ||
        course.name.toLowerCase().includes(normalizedQuery) ||
        course.teacherName.toLowerCase().includes(normalizedQuery);
      const statusMatches =
        status === "all" ||
        (status === "upcoming"
          ? ["scheduled", "live", "afterClass"].includes(course.status)
          : course.status === status);
      return searchMatches && statusMatches;
    });
  }, [courses, query, status]);

  return (
    <section className={styles.library}>
      <header className={styles.libraryIntro}>
        <div>
          <h1>{copy.library}</h1>
          <p>{copy.libraryDesc}</p>
        </div>
      </header>

      <div className={styles.libraryToolbar}>
        <label className={styles.search}>
          <Search aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.search}
            aria-label={copy.search}
          />
        </label>
        <div className={styles.filters}>
          {[
            ["all", copy.all],
            ["upcoming", copy.upcoming],
            ["finished", copy.finished],
            ["cancelled", copy.cancelled],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              data-active={status === value}
              onClick={() => setStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.courseList}>
        {filtered.length ? (
          filtered.map((course) => (
            <article key={course.id} className={styles.courseRow}>
              <span className={styles.dateBlock}>
                {course.startTime ? (
                  <>
                    {new Intl.DateTimeFormat(locale, {
                      month: "short",
                      day: "numeric",
                    }).format(new Date(course.startTime))}
                    <br />
                    {new Intl.DateTimeFormat(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    }).format(new Date(course.startTime))}
                  </>
                ) : (
                  "TBD"
                )}
              </span>
              <span className={styles.courseIdentity}>
                <strong>{course.name}</strong>
                <small>{course.description || copy.libraryDesc}</small>
                <span className={styles.courseMeta}>
                  <span className={styles.courseTeacher}>
                    <GraduationCap aria-hidden="true" />
                    {course.teacherName}
                  </span>
                  <span className={styles.courseType}>
                    <Users aria-hidden="true" />
                    {roomTypeLabel(course.roomType, copy)}
                  </span>
                </span>
              </span>
              <span
                className={styles.status}
                data-status={course.status}
              >
                <i aria-hidden="true" />
                {copy.status[course.status] || course.status}
              </span>
              <span className={styles.rowActions}>
                <button
                  type="button"
                  onClick={() => onOpen(course)}
                >
                  {copy.details}
                  <ArrowRight aria-hidden="true" />
                </button>
                <button
                  type="button"
                  data-primary="true"
                  disabled={
                    enteringCourseId === course.id ||
                    !canEnterClassroom(course.status)
                  }
                  onClick={() => onEnter(course)}
                >
                  {enteringCourseId === course.id ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <DoorOpen aria-hidden="true" />
                  )}
                  {enteringCourseId === course.id ? copy.live : copy.enter}
                </button>
              </span>
            </article>
          ))
        ) : (
          <div className={styles.emptyLibrary}>
            <div>
              <BookOpen aria-hidden="true" />
              <strong>{copy.noCourses}</strong>
              <p>{copy.noCoursesHint}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
