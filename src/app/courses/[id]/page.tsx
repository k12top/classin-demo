"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ChevronLeft, AlertTriangle, Key, Loader2, User, Users } from "lucide-react";

import { buildAccessDeniedUrl } from "@/lib/access-denied-codes";
import TeacherCourseDetail from "@/components/TeacherCourseDetail";
import StudentCourseDetail from "@/components/StudentCourseDetail";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "@/lib/i18n/context";

interface CourseDetail {
  id: string;
  name: string;
  description: string;
  roomType: number;
  teacherId: string;
  teacherName: string;
  status: string;
  startTime: string | null;
  endTime: string | null;
  studentRemarks: string;
  students: { id: string; studentId: string; studentName: string }[];
  groupLinks: {
    id: string;
    group: {
      id: string;
      name: string;
      members: { id: string; userId: string; userName: string }[];
    };
  }[];
}

export default function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [enterLoading, setEnterLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchCourse = useCallback(async () => {
    try {
      let res = await fetch(`/api/courses/${id}`, { credentials: "same-origin" });
      if (res.status === 401 && (await tryOAuthRefresh())) {
        res = await fetch(`/api/courses/${id}`, { credentials: "same-origin" });
      }
      if (res.status === 401) {
        redirectToSsoLogin();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setCourse(data.course);
      } else {
        setError("not_found");
      }
    } catch {
      setError("load_failed");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchCourse();
    });
  }, [fetchCourse]);

  const isTeacher = Boolean(user && course && casdoorUserIdsMatch(course.teacherId, user.userId));

  const handleEnterClassroom = async () => {
    if (!course || !user) return;
    setEnterLoading(true);

    try {
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

      const roomUuid = course.id.replace(/-/g, "").slice(0, 16);
      const params = new URLSearchParams({
        roomUuid,
        roomType: String(course.roomType),
        roomName: course.name,
        courseId: course.id,
      });
      router.push(`/classroom?${params.toString()}`);
    } catch {
      setError("verify_failed");
      setEnterLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-purple-500/20 border-t-purple-500" />
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold">
            {error === "not_found"
              ? `${t("join.courseNotExist")} / ${t("classroom.noAccess")}`
              : error === "load_failed"
              ? t("common.failed")
              : error === "verify_failed"
              ? t("classroom.verifyFailed")
              : error || t("join.courseNotExist")}
          </h2>
          <p className="text-muted-foreground">
            {error === "not_found" ? t("join.notFound") : ""}
          </p>
          <Button onClick={() => router.push("/")} className="bg-purple-600 hover:bg-purple-700 text-white">
            {t("common.backToHome")}
          </Button>
        </div>
      </div>
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
  const isEnrolled = isTeacher || isDirectStudent || isGroupStudent;

  return (
    <div className="min-h-screen bg-background">
      {/* Top Nav Bar */}
      <div className="border-b border-border/60 bg-card/60 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => router.push("/")} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="mr-1 h-4 w-4" /> {t("common.backToList")}
          </Button>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Badge variant="secondary" className={`flex items-center gap-1.5 px-3 py-1 ${
              isTeacher
                ? "bg-primary/10 text-primary border-primary/20"
                : "bg-muted text-muted-foreground border-border"
            }`}>
              {isTeacher ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}
              {isTeacher ? t("common.roleTeacher") : t("common.roleStudent")}
            </Badge>
            <span className="text-sm font-medium text-foreground">{user?.displayName || user?.name}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className={`max-w-6xl mx-auto px-6 py-8 ${!isEnrolled && course.roomType === 10 ? "flex justify-center items-center min-h-[calc(100vh-10rem)]" : ""}`}>
        {isTeacher ? (
          <TeacherCourseDetail 
            course={course} 
            user={user} 
            onEnterClassroom={handleEnterClassroom} 
            enterLoading={enterLoading}
            fetchCourse={fetchCourse}
          />
        ) : !isEnrolled && course.roomType === 10 ? (
          <PasscodeGate 
            course={course}
            t={t}
            onSuccess={async () => {
              await fetchCourse();
              void handleEnterClassroom();
            }}
          />
        ) : (
          <StudentCourseDetail 
            course={course} 
            user={user} 
            onEnterClassroom={handleEnterClassroom} 
            enterLoading={enterLoading}
            fetchCourse={fetchCourse}
          />
        )}
      </main>
    </div>
  );
}

function PasscodeGate({
  course,
  t,
  onSuccess,
}: {
  course: any;
  t: (key: string) => string;
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
      const focusIndex = Math.min(pasteData.length, 5);
      const nextInput = document.getElementById(`digit-${focusIndex}`);
      nextInput?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <Card className="border border-border/60 bg-card/60 backdrop-blur-xl p-8 sm:p-12 text-center flex flex-col items-center max-w-lg w-full relative overflow-hidden rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 animate-in fade-in zoom-in">
      <div className="absolute top-[-20%] right-[-10%] w-[250px] h-[250px] bg-primary/5 dark:bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
      
      <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <Key className="h-5 w-5 text-primary" />
      </div>

      <h2 className="text-2xl font-bold text-foreground mb-2">{t("passcodeGate.title")}</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        {t("passcodeGate.desc")}
      </p>

      <div className="px-4 py-3 bg-muted/50 dark:bg-muted/30 rounded-xl border border-border/40 space-y-1 w-full text-left mb-6">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t("teacherDashboard.fieldName")}</div>
        <div className="text-base font-semibold text-foreground truncate">{course.name}</div>
        <div className="text-xs text-primary font-medium mt-1">{t("courseDetail.teacherInfo").replace("{name}", course.teacherName)}</div>
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-6">
        <div className="flex justify-center gap-2.5">
          {digits.map((digit, idx) => (
            <input
              key={idx}
              id={`digit-${idx}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={handlePaste}
              className="w-12 h-14 bg-background border border-input hover:border-primary/40 focus:border-primary rounded-lg text-center text-2xl font-bold text-foreground focus:ring-2 focus:ring-primary/20 focus-visible:outline-none transition-all font-mono shadow-sm"
              autoFocus={idx === 0}
            />
          ))}
        </div>

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 py-2.5 px-4 rounded border border-destructive/20 animate-in fade-in duration-200">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={submitting || digits.some(d => !d)}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 text-base rounded-xl transition-all duration-300 shadow-sm"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("common.submitting")}
            </span>
          ) : (
            t("passcodeGate.btnJoin")
          )}
        </Button>
      </form>
    </Card>
  );
}
