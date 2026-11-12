"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { Key, Loader2 } from "lucide-react";

import { buildAccessDeniedUrl } from "@/lib/access-denied-codes";
import TeacherCourseDetail from "@/components/TeacherCourseDetail";
import StudentCourseDetail from "@/components/StudentCourseDetail";
import { CourseWorkspace } from "@/components/workspace/course-workspace";
import { WorkspaceSubpage } from "@/components/workspace/workspace-subpage";
import { WorkspacePageError } from "@/components/workspace/workspace-page-error";
import { workspaceCopyForLocale } from "@/components/workspace/workspace-copy";
import { PageLoadingState } from "@/components/ui/page-loading-state";
import { useTranslation } from "@/lib/i18n/context";
import { courseWorkspacePath, courseWorkspaceSection } from "@/lib/course-schedule";
import { hasCourseEntryAccess } from "@/lib/course-entry-permission";
import { openClassroomWindow, reserveClassroomWindow } from "@/lib/classroom/open-desktop-window";
import passcodeStyles from "@/components/workspace/passcode-gate.module.css";

interface CourseDetail {
  id: string;
  name: string;
  description: string;
  roomType: number;
  requiresPasscode?: boolean;
  ownerId?: string;
  ownerName?: string;
  ownerAvatar?: string;
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string;
  teachers?: { id?: string; teacherId: string; teacherName: string; teacherAvatar?: string }[];
  isCourseOwner?: boolean;
  canTeach?: boolean;
  canUploadCourseware?: boolean;
  limitedToSessionId?: string | null;
  status: string;
  startTime: string | null;
  endTime: string | null;
  studentRemarks: string;
  students: { id: string; studentId: string; studentName: string; studentAvatar?: string }[];
  groupLinks: {
    id: string;
    group: {
      id: string;
      name: string;
      members: { id: string; userId: string; userName: string; userAvatar?: string }[];
    };
  }[];
}

export default function CourseDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sessionId?: string | string[]; section?: string | string[]; draftId?: string | string[]; reviewId?: string | string[]; assignmentId?: string | string[]; createLesson?:string|string[] }> }) {
  const { id } = use(params);
  const query = use(searchParams);
  const requestedSessionId = typeof query.sessionId === "string" ? query.sessionId : "";
  const requestedSection = courseWorkspaceSection(query.section);
  const requestedDraftId = typeof query.draftId === "string" ? query.draftId : "";
  const requestedReviewId = typeof query.reviewId === "string" ? query.reviewId : "";
  const requestedAssignmentId = typeof query.assignmentId === "string" ? query.assignmentId : "";
  const requestedCreateLesson = query.createLesson === "1";
  const { user, loading: authLoading } = useAuth();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [courseOwner, setCourseOwner] = useState("");
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [enterLoading, setEnterLoading] = useState(false);
  const [error, setError] = useState("");
  const requestedCourseRef = useRef("");
  const accountId = user?.userId || "";
  const requestKey = JSON.stringify([id, accountId]);

  const fetchCourse = useCallback(async () => {
    let keepLoadingForRedirect = false;
    try {
      let res = await fetch(`/api/courses/${id}`, { credentials: "same-origin" });
      if (res.status === 401 && (await tryOAuthRefresh())) {
        res = await fetch(`/api/courses/${id}`, { credentials: "same-origin" });
      }
      if (requestedCourseRef.current !== requestKey) return;
      if (res.status === 401) {
        keepLoadingForRedirect = true;
        setRedirecting(true);
        redirectToSsoLogin(courseWorkspacePath(id,requestedSessionId,requestedSection,requestedDraftId,requestedReviewId,requestedAssignmentId,requestedCreateLesson));
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (requestedCourseRef.current !== requestKey) return;
        if(!data?.course || typeof data.course.id!=="string" || data.course.id!==id)throw new Error("Invalid course response");
        setCourse(data.course);
        setCourseOwner(accountId);
        setError("");
      } else {
        setError(res.status===403||res.status===404?"not_found":"load_failed");
      }
    } catch {
      if (requestedCourseRef.current === requestKey) setError("load_failed");
    } finally {
      if (!keepLoadingForRedirect && requestedCourseRef.current === requestKey) {
        setLoading(false);
      }
    }
  }, [id,accountId,requestKey,requestedSessionId,requestedSection,requestedDraftId,requestedReviewId,requestedAssignmentId,requestedCreateLesson]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      queueMicrotask(() => {
        redirectToSsoLogin(courseWorkspacePath(id,requestedSessionId,requestedSection,requestedDraftId,requestedReviewId,requestedAssignmentId,requestedCreateLesson));
      });
      return;
    }
    if (requestedCourseRef.current === requestKey) return;
    setError("");
    setCourse(null);
    setCourseOwner("");
    setLoading(true);
    requestedCourseRef.current = requestKey;
    void fetchCourse();
  }, [authLoading, fetchCourse, id, user, requestKey, requestedSessionId,requestedSection,requestedDraftId,requestedReviewId,requestedAssignmentId,requestedCreateLesson]);

  const isTeacher = Boolean(user && course?.canTeach);
  const redirectingToLogin = redirecting || (!authLoading && !user);

  const handleEnterClassroom = async () => {
    if (!course || !user) return;
    setEnterLoading(true);
    let navigating = false;
    let child: Window | null = null;
    let opened = false;

    try {
      child = reserveClassroomWindow();
      const res = await fetch(`/api/courses/${id}/verify-access`);
      if (!res.ok) {
        setError("verify_failed");
        setEnterLoading(false);
        return;
      }
      const data = await res.json();

      if (!data.allowed) {
        router.push(
          buildAccessDeniedUrl({
            code: data.code,
            reason: data.reason || "no_access",
            course: course.name,
            courseId: id,
          })
        );
        setEnterLoading(false);
        return;
      }

      if (typeof data.classroomUrl !== "string" || !data.classroomUrl) {
        setError("verify_failed");
        setEnterLoading(false);
        return;
      }
      const target = new URL(data.classroomUrl, window.location.origin);
      if (target.origin !== window.location.origin || target.pathname !== "/classroom") throw new Error("Invalid classroom");
      opened = await openClassroomWindow(target, child);
      if (!opened) {
        router.push(target.pathname + target.search);
        navigating = true;
      }
    } catch {
      setError("verify_failed");
    } finally {
      if (!opened) child?.close();
      if (!navigating) setEnterLoading(false);
    }
  };

  if (authLoading || redirectingToLogin) {
    return (
      <PageLoadingState
        message={redirectingToLogin ? t("login.redirecting") : t("common.loading")}
        variant="course"
      />
    );
  }


  if ((loading || (course && (course.id !== id || courseOwner !== accountId))) && user) {
    return (
      <WorkspaceSubpage user={user}>
        <PageLoadingState
          message={t("common.loading")}
          variant="course"
          embedded
        />
      </WorkspaceSubpage>
    );
  }

  if (error || !course) {
    const copy=workspaceCopyForLocale(locale),canRetry=error==="load_failed"||error==="verify_failed";
    const title=error==="not_found"?`${t("join.courseNotExist")} / ${t("classroom.noAccess")}`:error==="verify_failed"?t("classroom.verifyFailed"):error==="load_failed"?t("common.failed"):error||t("join.courseNotExist");
    return (
      <WorkspaceSubpage user={user!}><WorkspacePageError title={title} description={error==="not_found"?t("join.notFound"):undefined} backLabel={t("common.backToHome")} retryLabel={copy.retry} onBack={()=>router.push("/")} onRetry={canRetry?()=>{if(error==="verify_failed"&&course){setError("");void handleEnterClassroom();return;}setLoading(true);setError("");void fetchCourse();}:undefined}/></WorkspaceSubpage>
    );
  }

  const isDirectStudent = Boolean(
    user && course?.students?.some((s) => casdoorUserIdsMatch(s.studentId, user.userId))
  );
  const isGroupStudent = Boolean(
    user && course?.groupLinks?.some((gl) =>
      gl.group?.members?.some((m) => casdoorUserIdsMatch(m.userId, user.userId))
    )
  );
  const isEnrolled = hasCourseEntryAccess({canTeach:isTeacher,directStudent:isDirectStudent,groupStudent:isGroupStudent,limitedToSessionId:course.limitedToSessionId});

  if (isEnrolled || course.roomType !== 10 || !course.requiresPasscode) {
    return <CourseWorkspace key={course.id} requestedSessionId={requestedSessionId} requestedSection={requestedSection} requestedDraftId={requestedDraftId} requestedReviewId={requestedReviewId} requestedAssignmentId={requestedAssignmentId} requestedCreateLesson={requestedCreateLesson} course={course} user={user!} canTeach={isTeacher} renderManagement={(tab,onChange,options) => isTeacher ?
      <TeacherCourseDetail course={course} user={user} onEnterClassroom={handleEnterClassroom} enterLoading={enterLoading} fetchCourse={fetchCourse} workspaceTab={tab} onWorkspaceTabChange={onChange} workspaceProgram={options} /> :
      <StudentCourseDetail course={course} user={user} onEnterClassroom={handleEnterClassroom} enterLoading={enterLoading} fetchCourse={fetchCourse} workspaceTab={tab} onWorkspaceTabChange={onChange} />
    } />;
  }

  return (
    <WorkspaceSubpage user={user!}>
          <PasscodeGate 
            course={course}
            t={t}
            locale={locale}
            onSuccess={async () => {
              await fetchCourse();
              void handleEnterClassroom();
            }}
          />
    </WorkspaceSubpage>
  );
}

function PasscodeGate({
  course,
  t,
  locale,
  onSuccess,
}: {
  course: Pick<CourseDetail, "id" | "name" | "teacherName">;
  t: (key: string) => string;
  locale: string;
  onSuccess: () => Promise<void>;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleDigitChange = (index: number, val: string) => {
    const cleanVal = val.replace(/\D/g, "");
    if (!cleanVal) {
      const newDigits = [...digits];
      newDigits[index] = "";
      setDigits(newDigits);
      return;
    }
    const char = cleanVal.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);
    setError("");

    if (index < 5) {
      const nextInput = document.getElementById(`digit-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      const newDigits = [...digits];
      newDigits[index - 1] = "";
      setDigits(newDigits);
      const prevInput = document.getElementById(`digit-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasteData.length > 0) {
      const newDigits = Array(6).fill("");
      for (let i = 0; i < pasteData.length; i++) {
        newDigits[i] = pasteData[i] || "";
      }
      setDigits(newDigits);
      setError("");
      const focusIndex = Math.min(pasteData.length, 5);
      const nextInput = document.getElementById(`digit-${focusIndex}`);
      nextInput?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(submitting)return;
    const passcode = digits.join("");
    if (passcode.length !== 6) {
      setError(t("teacherDashboard.errPasscodeInvalid"));
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/courses/${course.id}/join-by-passcode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("passcodeGate.errInvalidPasscode"));
      } else {
        await onSuccess();
      }
    } catch {
      setError(t("common.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={passcodeStyles.page}><section className={passcodeStyles.panel} aria-labelledby="passcode-title">
      <span className={passcodeStyles.icon}><Key size={20} aria-hidden="true"/></span>
      <h1 id="passcode-title">{t("passcodeGate.title")}</h1>
      <p className={passcodeStyles.description}>{t("passcodeGate.desc")}</p>
      <div className={passcodeStyles.course}>
        <small>{t("teacherDashboard.fieldName")}</small><strong>{course.name}</strong>
        <span>{t("courseDetail.teacherInfo").replace("{name}", course.teacherName)}</span>
      </div>
      <form onSubmit={handleSubmit} className={passcodeStyles.form}>
        <div className={passcodeStyles.digits}>
          {digits.map((digit, idx) => (
            <input
              key={idx}
              id={`digit-${idx}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              aria-label={`${locale==="zh-TW"?"密碼第":locale.startsWith("zh")?"密码第":locale.startsWith("vi")?"Chữ số mật mã":"Passcode digit"} ${idx+1}${locale.startsWith("zh")?"位":""}`}
              aria-invalid={Boolean(error)}
              disabled={submitting}
              onChange={(e) => handleDigitChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={handlePaste}
              autoFocus={idx === 0}
            />
          ))}
        </div>

        {error && (
          <p role="alert" className={passcodeStyles.error}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || digits.some(d => !d)}
          className={passcodeStyles.submit}
        >
          {submitting ? (
            <span>
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              {t("common.submitting")}
            </span>
          ) : (
            t("passcodeGate.btnJoin")
          )}
        </button>
      </form>
    </section></main>
  );
}
