"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlayCircle, Clock, User, BookOpen, FileText, Loader2, CalendarClock, CalendarCheck2, RefreshCw } from "lucide-react";
import { CourseStatusBadge } from "@/components/CourseStatusBadge";
import { canEnterClassroom } from "@/lib/course-status";
import { useTranslation } from "@/lib/i18n/context";
import { playbackPagePath } from "@/lib/playback-url";
import TimeDisplay from "@/components/TimeDisplay";
import workspaceStyles from "@/components/portal/course-workspace.module.css";
import { CourseSessionManager } from "@/components/course-sessions/course-session-manager";
import { StudentAttendancePanel } from "@/components/attendance/student-attendance-panel";

const ROOM_TYPE_KEYS: Record<number, string> = {
  0: "common.roomType1v1",
  4: "common.roomTypeSmall",
  2: "common.roomTypeBig",
  10: "common.roomTypePublic",
};

interface StudentCourse {
  id: string;
  name: string;
  description: string;
  roomType: number;
  courseKind?: "series" | "standalone";
  teacherName: string;
  status: string;
  startTime: string | null;
  recordUrl?: string | null;
  hasPlayback?: boolean;
  studentRemarks: string;
}

interface StudentCourseUser {
  userId: string;
  name?: string;
  displayName?: string;
}

interface CoursewareItem {
  id: string;
  name: string;
  ext: string;
  size?: number;
  downloadUrl: string;
}

export default function StudentCourseDetail({ 
  course, 
  onEnterClassroom,
  enterLoading,
}: { 
  course: StudentCourse;
  user: StudentCourseUser | null;
  onEnterClassroom: () => void;
  enterLoading: boolean;
  fetchCourse: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("sessions");
  const { t } = useTranslation();

  const [courseware, setCourseware] = useState<CoursewareItem[]>([]);
  const [coursewareLoading, setCoursewareLoading] = useState(true);
  const [coursewareError, setCoursewareError] = useState("");

  const fetchCourseware = useCallback(async () => {
    setCoursewareLoading(true);
    setCoursewareError("");
    try {
      const res = await fetch(`/api/courses/${course.id}/courseware`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("common.failed"));
      setCourseware(data.courseware ?? []);
    } catch (e) {
      console.error("Failed to fetch courseware:", e);
      setCoursewareError(e instanceof Error ? e.message : t("common.failed"));
    } finally {
      setCoursewareLoading(false);
    }
  }, [course.id, t]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchCourseware();
    });
  }, [fetchCourseware]);

  const getFileIcon = (ext: string) => {
    const normExt = ext.toLowerCase();
    if (normExt === "pdf") return <FileText className="h-5 w-5 text-red-500 shrink-0" />;
    if (["ppt", "pptx"].includes(normExt)) return <FileText className="h-5 w-5 text-orange-500 shrink-0" />;
    if (["doc", "docx"].includes(normExt)) return <FileText className="h-5 w-5 text-blue-500 shrink-0" />;
    return <FileText className="h-5 w-5 text-muted-foreground shrink-0" />;
  };

  return (
    <div className={`${workspaceStyles.workspace} max-w-5xl mx-auto space-y-4 pb-10 pt-3`}>
      {/* Header Card */}
      <Card className={workspaceStyles.hero}>
        <CardContent className={workspaceStyles.heroContent}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div className="space-y-4">
              <div className={workspaceStyles.heroTopline}>
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary text-[10px]">
                  {t(
                    course.courseKind === "standalone"
                      ? "portal.standaloneCourse"
                      : "portal.courseGroup",
                  )}
                </Badge>
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary text-[10px]">
                  {t(ROOM_TYPE_KEYS[course.roomType]) || t("common.unknown")}
                </Badge>
              </div>
              <h1 className={workspaceStyles.heroTitle}>{course.name}</h1>
              
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-4">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${workspaceStyles.heroPill}`}>
                  <User className="h-4 w-4 text-primary" />
                  <span className="text-foreground/80">{t("courseDetail.teacherInfo", { name: course.teacherName })}</span>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${workspaceStyles.heroPill}`}>
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-foreground/80">
                    <TimeDisplay isoString={course.startTime} options={{ month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit" }} />
                  </span>
                </div>
                <CourseStatusBadge status={course.status} />
              </div>
            </div>
            
            {!(course.status === "finished" && !course.hasPlayback) && (
            <div className="w-full md:w-auto shrink-0">
              <Button
                size="lg"
                className={`w-full md:w-auto rounded-xl font-medium active:scale-[0.98] transition-all ${workspaceStyles.primaryAction}`}
                onClick={() => {
                  if (course.status === "finished") {
                    router.push(playbackPagePath(course.id));
                  } else {
                    onEnterClassroom();
                  }
                }}
                disabled={enterLoading || (course.status !== "finished" && !canEnterClassroom(course.status))}
              >
                {enterLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-current" />
                    {t("teacherDashboard.btnEntering")}
                  </span>
                ) : course.status === "finished" ? (
                  <span className="flex items-center gap-2">
                    <PlayCircle className="h-5 w-5" />
                    {t("studentDashboard.viewPlayback")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2"><PlayCircle className="h-5 w-5" /> {t("studentDashboard.enterClassroom")}</span>
                )}
              </Button>
            </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs Area */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className={`${workspaceStyles.tabsShell} mb-6`}>
          <div className={workspaceStyles.tabsScroller}>
            <TabsList className={`inline-flex ${workspaceStyles.tabs}`}>
              <TabsTrigger value="sessions" className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium text-sm">
                <CalendarClock className="mr-2 h-4 w-4" /> {t("courseSessions.title")}
              </TabsTrigger>
              <TabsTrigger value="info" className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium text-sm">
                <BookOpen className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.info")}
              </TabsTrigger>
              <TabsTrigger value="courseware" className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium text-sm">
                <FileText className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.courseware")}
              </TabsTrigger>
              <TabsTrigger value="attendance" className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium text-sm">
                <CalendarCheck2 className="mr-2 h-4 w-4" /> {t("studentAttendance.tab")}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="sessions" className="mt-0">
          <CourseSessionManager
            courseId={course.id}
            courseName={course.name}
            roomType={course.roomType}
            canManage={false}
            leadTeacherId=""
            teachers={[]}
            students={[]}
            groupLinks={[]}
            onManageRoster={() => undefined}
          />
        </TabsContent>

        <TabsContent value="info" className="mt-0">
          <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold">{t("courseDetail.courseDescription")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {course.description || t("courseDetail.noDescription")}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="courseware" className="mt-0">
          <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold">{t("courseDetail.tabs.courseware")}</CardTitle>
              <CardDescription className="text-xs">{t("courseDetail.noCoursewareDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {coursewareLoading ? (
                <div className="flex items-center justify-center py-12" role="status">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="sr-only">{t("common.loading")}</span>
                </div>
              ) : coursewareError ? (
                <div className="text-center py-12 border border-dashed border-destructive/40 rounded-xl bg-destructive/5" role="alert">
                  <p className="text-sm text-destructive mb-4">{coursewareError}</p>
                  <Button variant="outline" size="sm" onClick={() => void fetchCourseware()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t("classroom.v3.retry")}
                  </Button>
                </div>
              ) : courseware.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border/60 rounded-xl bg-muted/10">
                  <FileText className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm font-medium">{t("courseDetail.noCourseware")}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">{t("courseDetail.noCoursewareDescStudent")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {courseware.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border/40 hover:border-primary/20 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        {getFileIcon(item.ext)}
                        <div>
                          <p className="text-sm font-bold text-foreground">{item.name}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{t("teacherDashboard.fieldType")}: {item.ext.toUpperCase()}</span>
                            <span>•</span>
                            <span>{t("teacherDashboard.memberCount")}: {item.size ? `${(item.size / 1024 / 1024).toFixed(2)} MB` : t("common.unknown")}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px]">{t("courseDetail.ready")}</Badge>
                        <a
                          href={item.downloadUrl}
                          className="bg-primary hover:bg-primary/95 text-white text-xs px-3.5 py-2 rounded-xl font-medium shadow-sm transition-all"
                        >
                          {t("courseDetail.downloadCourseware")}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="mt-0">
          <StudentAttendancePanel
            courseId={course.id}
            enabled={activeTab === "attendance"}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}
