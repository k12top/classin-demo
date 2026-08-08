"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { LogOut, Calendar, Clock, User, PlayCircle, Loader2, Info, FileText, MessageSquare, ExternalLink, Key, RefreshCw } from "lucide-react";
import { CourseStatusBadge } from "@/components/CourseStatusBadge";
import { CourseStatus, isUpcomingStatus, canEnterClassroom } from "@/lib/course-status";
import { useTranslation } from "@/lib/i18n/context";
import TimeDisplay, { CourseTimeRangeDisplay } from "@/components/TimeDisplay";
import { buildAccessDeniedUrl } from "@/lib/access-denied-codes";
import { CourseTeacherAvatarGroup, type CourseTeacherAvatarItem } from "@/components/CourseTeacherAvatarGroup";
import { playbackPagePath } from "@/lib/playback-url";
import { prefetchCourseDetail } from "@/lib/course-detail-client-cache";
import {
  PortalShell,
  type PortalPage,
} from "@/components/portal/portal-shell";
import {
  PortalCourseLibrary,
  PortalDashboardHero,
  PortalSectionHeader,
} from "@/components/portal/portal-dashboard";
import { usePortalFeedback } from "@/components/portal/portal-feedback";

interface Course {
  id: string;
  name: string;
  description: string;
  roomType: number;
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string;
  teachers?: CourseTeacherSummary[];
  status: string;
  startTime: string | null;
  endTime: string | null;
  studentRemarks: string;
  createdAt: string;
  updatedAt: string;
  recordUrl?: string | null;
  hasPlayback?: boolean;
  requiresPasscode?: boolean;
  publicListing?: boolean;
}

interface CourseTeacherSummary {
  id?: string;
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string;
}

interface DashboardUser {
  userId: string;
  name?: string;
  displayName?: string;
  avatar?: string;
  email?: string;
  role?: string;
}

const ROOM_TYPE_KEYS: Record<number, string> = {
  0: "common.roomType1v1",
  4: "common.roomTypeSmall",
  2: "common.roomTypeBig",
  10: "common.roomTypePublic",
};

type SidebarPage = "learning" | "courses" | "settings";
type CourseTab = "upcoming" | "finished" | "cancelled";

interface CoursewareItem {
  id: string;
  name: string;
  ext: string;
  url: string;
}

export default function StudentDashboard({ courses, user, fetchCourses }: { courses: Course[], user: DashboardUser, fetchCourses: () => void }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [activePage, setActivePage] = useState<SidebarPage>("learning");
  const [activeTab, setActiveTab] = useState<CourseTab>("upcoming");
  
  // Dashboard join inputs
  const [joinCourseId, setJoinCourseId] = useState("");
  const [joining, setJoining] = useState(false);
  
  // Direct entering spinner
  const [enteringCourseId, setEnteringCourseId] = useState<string | null>(null);

  // Dialog course details state
  const [selectedDetailCourse, setSelectedDetailCourse] = useState<Course | null>(null);
  const [detailCourseware, setDetailCourseware] = useState<CoursewareItem[]>([]);
  const [loadingCourseware, setLoadingCourseware] = useState(false);
  const [detailCoursewareError, setDetailCoursewareError] = useState("");

  const { t } = useTranslation();
  const { notify } = usePortalFeedback();

  useEffect(() => {
    const requestedPage = new URLSearchParams(window.location.search).get("view");
    if (
      requestedPage === "learning" ||
      requestedPage === "courses" ||
      requestedPage === "settings"
    ) {
      queueMicrotask(() => setActivePage(requestedPage));
    }
  }, []);

  const getCourseTeacherItems = (course: Course): CourseTeacherAvatarItem[] => {
    const teachers =
      course.teachers && course.teachers.length > 0
        ? course.teachers
        : [{
            teacherId: course.teacherId,
            teacherName: course.teacherName,
            teacherAvatar: course.teacherAvatar || "",
          }];
    const uniqueTeachers: CourseTeacherAvatarItem[] = [];
    for (const teacher of teachers) {
      if (!uniqueTeachers.some((item) => item.teacherId === teacher.teacherId)) {
        uniqueTeachers.push({
          teacherId: teacher.teacherId,
          teacherName: teacher.teacherName || teacher.teacherId,
          teacherAvatar: teacher.teacherAvatar || "",
        });
      }
    }
    return uniqueTeachers;
  };

  const handleJoinCourseById = async () => {
    const cid = joinCourseId.trim();
    if (!cid || joining) return;

    if (/^\d{6}$/.test(cid)) {
      setJoining(true);
      try {
        const res = await fetch(`/api/courses/search-by-passcode?passcode=${cid}`);
        const data = await res.json();
        if (res.ok && data.courseId) {
          router.push(`/courses/${data.courseId}`);
        } else {
          const err = data.error === "errPasscodeNotFound"
            ? t("studentDashboard.errPasscodeNotFound")
            : t("common.failed");
          notify(err, "error");
        }
      } catch (err) {
        console.error(err);
        notify(t("common.failed"), "error");
      } finally {
        setJoining(false);
      }
    } else {
      const isUuid = cid.length === 36 || cid.length === 32;
      if (!isUuid) {
        notify(t("studentDashboard.errInvalidCourseId"), "error");
        return;
      }
      router.push(`/courses/${cid}`);
    }
  };

  const filteredCourses = useMemo(() => {
    switch (activeTab) {
      case "upcoming": return courses.filter((c) => isUpcomingStatus(c.status));
      case "finished": return courses.filter((c) => c.status === CourseStatus.FINISHED);
      case "cancelled": return courses.filter((c) => c.status === CourseStatus.CANCELLED);
      default: return [];
    }
  }, [courses, activeTab]);

  const loadDetailCourseware = useCallback(async (courseId: string) => {
    setLoadingCourseware(true);
    setDetailCoursewareError("");
    try {
      const res = await fetch(`/api/courses/${courseId}/courseware`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("common.failed"));
      setDetailCourseware(data.courseware ?? []);
    } catch (error) {
      console.error(error);
      setDetailCoursewareError(
        error instanceof Error ? error.message : t("common.failed"),
      );
    } finally {
      setLoadingCourseware(false);
    }
  }, [t]);

  // Direct joining logic
  const handleEnterClassroomDirect = async (course: Course) => {
    if (enteringCourseId) return;
    if (course.publicListing && course.requiresPasscode) {
      router.push(`/courses/${course.id}`);
      return;
    }
    setEnteringCourseId(course.id);

    try {
      const res = await fetch(`/api/courses/${course.id}/verify-access`);
      const data = await res.json().catch(() => ({}));
      if (
        data.code === "course_finished" ||
        data.code === "course_cancelled"
      ) {
        await fetchCourses();
        notify(data.reason || t("classroom.verifyFailed"));
        setEnteringCourseId(null);
        return;
      }
      if (!res.ok) {
        notify(t("classroom.verifyFailed"), "error");
        setEnteringCourseId(null);
        return;
      }

      if (!data.allowed) {
        router.push(
          buildAccessDeniedUrl({
            code: data.code,
            reason: data.reason || "no_access",
            course: course.name,
            courseId: course.id,
          })
        );
        setEnteringCourseId(null);
        return;
      }

      if (typeof data.classroomUrl !== "string" || !data.classroomUrl) {
        notify(t("classroom.verifyFailed"), "error");
        setEnteringCourseId(null);
        return;
      }
      router.push(data.classroomUrl);
    } catch (err) {
      console.error(err);
      notify(t("classroom.verifyFailed"), "error");
      setEnteringCourseId(null);
    }
  };

  // Dialog details courseware load
  useEffect(() => {
    if (!selectedDetailCourse) {
      queueMicrotask(() => {
        setDetailCourseware([]);
      });
      return;
    }
    queueMicrotask(() => void loadDetailCourseware(selectedDetailCourse.id));
  }, [loadDetailCourseware, selectedDetailCourse]);

  return (
    <PortalShell
      role="student"
      user={user}
      activePage={activePage}
      onPageChange={(page: PortalPage) => setActivePage(page as SidebarPage)}
      onLogout={logout}
    >
      <main className="w-full">
        
        {activePage === "learning" && (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            <PortalDashboardHero
              role="student"
              courses={courses}
              enteringCourseId={enteringCourseId}
              onEnter={(course) =>
                void handleEnterClassroomDirect(course as Course)
              }
              onOpen={(course) => router.push(`/courses/${course.id}`)}
              onPlayback={(course) => router.push(playbackPagePath(course.id))}
              onPrefetch={(course) => {
                router.prefetch(`/courses/${course.id}`);
                void prefetchCourseDetail(course.id);
              }}
            />
            {/* Breathable Join Public Course Card */}
            <Card className="border border-border/80 bg-card/60 p-6 flex flex-col sm:flex-row gap-4 items-center justify-between shadow-sm rounded-2xl">
              <div className="space-y-1 text-center sm:text-left">
                <h3 className="font-bold text-lg text-foreground">{t("studentDashboard.joinPublicClassTitle")}</h3>
                <p className="text-sm text-muted-foreground">{t("studentDashboard.joinPublicClassDesc")}</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto shrink-0">
                <Input
                  placeholder={t("studentDashboard.joinPublicClassPlaceholder")}
                  className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 w-full sm:w-[300px] text-sm rounded-xl font-mono"
                  value={joinCourseId}
                  onChange={(e) => setJoinCourseId(e.target.value.trim())}
                  onKeyDown={(e) => e.key === "Enter" && joinCourseId && handleJoinCourseById()}
                  disabled={joining}
                />
                <Button 
                  onClick={handleJoinCourseById}
                  disabled={!joinCourseId || joining}
                  className="bg-primary hover:bg-primary/95 text-white shrink-0 rounded-xl font-medium shadow-sm active:scale-[0.98] transition-all"
                >
                  {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : t("studentDashboard.joinPublicClassBtn")}
                </Button>
              </div>
            </Card>

            <Tabs defaultValue="upcoming" className="w-full" onValueChange={(v) => setActiveTab(v as CourseTab)}>
              <TabsList className="bg-muted/60 border border-border/40 p-1 rounded-xl mb-6">
                <TabsTrigger value="upcoming" className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium">{t("studentDashboard.tabUpcoming")}</TabsTrigger>
                <TabsTrigger value="finished" className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium">{t("studentDashboard.tabFinished")}</TabsTrigger>
                <TabsTrigger value="cancelled" className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium">{t("studentDashboard.tabCancelled")}</TabsTrigger>
              </TabsList>
              
              <TabsContent value={activeTab} className="space-y-4 outline-none">
                {filteredCourses.length === 0 ? (
                  <Card className="border border-border/60 bg-card/40 text-center p-16 rounded-2xl">
                    <p className="text-muted-foreground font-medium">{t("studentDashboard.noCourses")}</p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {filteredCourses.map(course => {
                      const isEntering = enteringCourseId === course.id;
                      const joinable = canEnterClassroom(course.status);

                      return (
                        <Card key={course.id} className="border border-border/60 bg-card overflow-hidden rounded-2xl hover:border-primary/30 hover:shadow-md active:scale-[0.99] transition-all duration-300 flex flex-col md:flex-row">
                          
                          {/* Left date block */}
                          <div className="md:w-64 bg-muted/40 p-6 flex flex-col justify-center items-center text-center border-b md:border-b-0 md:border-r border-border/50">
                            <Calendar className="h-7 w-7 text-primary/80 mb-2" />
                            <div className="font-semibold text-sm text-foreground/90 leading-tight">
                              <CourseTimeRangeDisplay
                                startIsoString={course.startTime}
                                endIsoString={course.endTime}
                              />
                            </div>
                            


                            <Badge variant="outline" className="mt-3 border-primary/20 bg-primary/5 text-primary text-[10px]">
                              {t(ROOM_TYPE_KEYS[course.roomType]) || t("common.unknown")}
                            </Badge>
                          </div>

                          {/* Right contents block */}
                          <div className="flex-1 p-6 flex flex-col justify-between">
                            <div>
                              <div className="flex justify-between items-start mb-2">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="text-lg font-bold text-foreground hover:text-primary transition-colors cursor-pointer" onClick={() => setSelectedDetailCourse(course)}>
                                      {course.name}
                                    </h3>
                                    <CourseStatusBadge status={course.status} />
                                    {course.publicListing && course.requiresPasscode && (
                                      <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary text-[10px] flex items-center gap-1">
                                        <Key className="h-3 w-3" />
                                        <span>{t("courseDetail.passcodeLabel")}</span>
                                      </Badge>
                                    )}
                                  </div>
                                  <CourseTeacherAvatarGroup
                                    leadLabel={t("common.lead")}
                                    leadTeacher={{
                                      teacherId: course.teacherId,
                                      teacherName: course.teacherName,
                                      teacherAvatar: course.teacherAvatar || "",
                                    }}
                                    teachers={getCourseTeacherItems(course)}
                                    className="mt-2"
                                  />
                                </div>
                                
                              </div>
                              
                              <button
                                type="button"
                                className="mt-3 flex w-full items-center gap-2 rounded-xl border border-border/50 bg-muted/15 p-3 text-left text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                onClick={() => router.push(`/courses/${course.id}`)}
                              >
                                <MessageSquare className="h-3.5 w-3.5 text-primary" />
                                <span>{t("studentDashboard.lessonFeedbackHint")}</span>
                              </button>
                            </div>

                            {/* Footer triggers */}
                            <div className="mt-5 pt-4 border-t border-border/40 flex justify-between items-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1.5 rounded-lg"
                                onClick={() => setSelectedDetailCourse(course)}
                              >
                                <Info className="h-4 w-4" />
                                <span>{t("courseDetail.tabs.info")}</span>
                              </Button>

                              <Button 
                                disabled={isEntering || (course.status !== "finished" && !joinable)}
                                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary/95 active:scale-[0.98] flex items-center gap-1.5"
                                onClick={() => {
                                  if (course.status === "finished" && course.hasPlayback) {
                                    router.push(playbackPagePath(course.id));
                                  } else if (course.status === "finished") {
                                    router.push(`/courses/${course.id}`);
                                  } else {
                                    handleEnterClassroomDirect(course);
                                  }
                                }}
                              >
                                {isEntering ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin text-current" />
                                    <span>{t("teacherDashboard.btnEntering")}</span>
                                  </>
                                ) : (
                                  <>
                                    <PlayCircle className="h-4.5 w-4.5 text-current" />
                                    <span>
                                      {course.status === "finished"
                                        ? course.hasPlayback
                                          ? t("studentDashboard.viewPlayback")
                                          : t("teacherDashboard.btnDetails")
                                        : t("studentDashboard.enterClassroom")}
                                    </span>
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {activePage === "courses" && (
          <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-3 duration-300">
            <PortalCourseLibrary
              courses={courses}
              enteringCourseId={enteringCourseId}
              onEnter={(course) =>
                void handleEnterClassroomDirect(course as Course)
              }
              onOpen={(course) => router.push(`/courses/${course.id}`)}
              onPrefetch={(course) => {
                router.prefetch(`/courses/${course.id}`);
                void prefetchCourseDetail(course.id);
              }}
            />
          </div>
        )}

        {activePage === "settings" && (
          <SettingsPanel user={user} onLogout={logout} />
        )}
      </main>

      {/* Breathable Slide Dialog for Course Details (Replaces nested page redirection) */}
      <Dialog open={!!selectedDetailCourse} onOpenChange={(open) => !open && setSelectedDetailCourse(null)}>
        <DialogContent className="max-w-xl bg-card border border-border/80 rounded-2xl shadow-xl animate-in zoom-in-95 duration-200">
          {selectedDetailCourse && (
            <>
              <DialogHeader className="pb-4 border-b border-border/40">
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary text-[10px]">
                    {t(ROOM_TYPE_KEYS[selectedDetailCourse.roomType]) || t("common.unknown")}
                  </Badge>
                  <CourseStatusBadge status={selectedDetailCourse.status} />
                  {selectedDetailCourse.publicListing && selectedDetailCourse.requiresPasscode && (
                    <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary text-[10px] flex items-center gap-1">
                      <Key className="h-3 w-3" />
                      <span>{t("courseDetail.passcodeLabel")}</span>
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-xl font-bold text-foreground leading-tight">
                  {selectedDetailCourse.name}
                </DialogTitle>
                <DialogDescription className="mt-3">
                  <CourseTeacherAvatarGroup
                    leadLabel={t("common.lead")}
                    leadTeacher={{
                      teacherId: selectedDetailCourse.teacherId,
                      teacherName: selectedDetailCourse.teacherName,
                      teacherAvatar: selectedDetailCourse.teacherAvatar || "",
                    }}
                    teachers={getCourseTeacherItems(selectedDetailCourse)}
                  />
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="info" className="w-full mt-2">
                <TabsList className="bg-muted/50 border border-border/40 p-0.5 rounded-lg w-full flex">
                  <TabsTrigger value="info" className="flex-1 text-xs rounded-md py-1.5"><Info className="h-3.5 w-3.5 mr-1" />{t("courseDetail.tabs.info")}</TabsTrigger>
                  <TabsTrigger value="courseware" className="flex-1 text-xs rounded-md py-1.5"><FileText className="h-3.5 w-3.5 mr-1" />{t("courseDetail.tabs.courseware")}</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="space-y-4 pt-3 outline-none text-sm">
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 bg-muted/20 border border-border/40 rounded-xl p-3">
                      <Clock className="h-4.5 w-4.5 text-primary mt-0.5" />
                      <div className="space-y-0.5 flex-1">
                        <span className="text-xs text-muted-foreground font-medium block">
                          {t("teacherDashboard.classSchedule")}
                        </span>
                        <div className="font-semibold text-foreground text-sm">
                          <TimeDisplay isoString={selectedDetailCourse.startTime} options={{ month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit" }} />
                        </div>

                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground font-medium">
                        {t("teacherDashboard.fieldDesc")}
                      </span>
                      <p className="text-foreground/80 leading-relaxed bg-muted/10 p-3.5 border border-border/40 rounded-xl">
                        {selectedDetailCourse.description || t("courseDetail.noDescription")}
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="courseware" className="pt-3 outline-none max-h-56 overflow-y-auto custom-scrollbar">
                  {loadingCourseware ? (
                    <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                  ) : detailCoursewareError ? (
                    <div className="text-center p-8 border border-dashed border-destructive/40 rounded-xl" role="alert">
                      <p className="text-xs text-destructive mb-3">{detailCoursewareError}</p>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void loadDetailCourseware(selectedDetailCourse.id)}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1" />
                        {t("classroom.v3.retry")}
                      </Button>
                    </div>
                  ) : detailCourseware.length === 0 ? (
                    <div className="text-center p-8 border border-dashed border-border/60 rounded-xl">
                      <p className="text-xs text-muted-foreground">
                        {t("courseDetail.noCoursewareDescStudent")}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {detailCourseware.map((cw) => (
                        <div key={cw.id} className="flex justify-between items-center p-3 border border-border/60 rounded-xl bg-card hover:bg-muted/20 transition-colors">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <span className="text-xs font-semibold text-foreground truncate max-w-xs">{cw.name}</span>
                            <Badge variant="outline" className="text-[9px] uppercase border-border/80">{cw.ext}</Badge>
                          </div>
                          <Button size="sm" variant="ghost" className="h-7 text-xs rounded-md flex items-center gap-1 text-primary hover:text-primary-foreground hover:bg-primary" onClick={() => window.open(cw.url, "_blank", "noopener,noreferrer")}>
                            <span>{t("courseDetail.openFile")}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

              </Tabs>

              <DialogFooter className="pt-4 border-t border-border/40 gap-2 sm:gap-0 mt-4 flex items-center justify-between w-full">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground rounded-lg h-9" onClick={() => router.push(`/courses/${selectedDetailCourse.id}`)}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  {t("teacherDashboard.btnDetails")}
                </Button>
                
                <div className="flex gap-2">
                  <Button variant="secondary" className="rounded-xl h-9 text-xs" onClick={() => setSelectedDetailCourse(null)}>
                    {t("common.cancel")}
                  </Button>
                  <Button 
                    disabled={enteringCourseId === selectedDetailCourse.id || (selectedDetailCourse.status !== "finished" && !canEnterClassroom(selectedDetailCourse.status))}
                    className="bg-primary hover:bg-primary/95 text-white rounded-xl h-9 text-xs font-semibold shadow-sm active:scale-[0.98]"
                    onClick={() => {
                      const course = selectedDetailCourse;
                      setSelectedDetailCourse(null);
                      if (course.status === "finished" && course.hasPlayback) {
                        router.push(playbackPagePath(course.id));
                      } else if (course.status === "finished") {
                        router.push(`/courses/${course.id}`);
                      } else {
                        handleEnterClassroomDirect(course);
                      }
                    }}
                  >
                    {enteringCourseId === selectedDetailCourse.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <PlayCircle className="h-3.5 w-3.5 mr-1" />
                    )}
                    {selectedDetailCourse.status === "finished"
                      ? selectedDetailCourse.hasPlayback
                        ? t("studentDashboard.viewPlayback")
                        : t("teacherDashboard.btnDetails")
                      : t("studentDashboard.enterClassroom")}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PortalShell>
  );
}

function SettingsPanel({ user, onLogout }: { user: DashboardUser; onLogout: () => void }) {
  const { t } = useTranslation();
  const { updateUserAvatar } = useAuth();
  const [avatarDraft, setAvatarDraft] = useState(user.avatar || "");
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      setAvatarDraft(user.avatar || "");
    });
  }, [user.avatar]);

  const handleSaveAvatar = async () => {
    const avatar = avatarDraft.trim();
    setAvatarSaving(true);
    setAvatarMessage("");

    try {
      const res = await fetch("/api/auth/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ avatar }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAvatarMessage(
          data?.error === "Invalid avatar URL"
            ? t("settingsPanel.errAvatarUrlInvalid")
            : t("settingsPanel.avatarUpdateFailed")
        );
        return;
      }

      const nextAvatar = typeof data?.avatar === "string" ? data.avatar : avatar;
      updateUserAvatar(nextAvatar);
      setAvatarDraft(nextAvatar);
      setAvatarMessage(t("settingsPanel.avatarUpdateSuccess"));
    } catch {
      setAvatarMessage(t("settingsPanel.avatarUpdateFailed"));
    } finally {
      setAvatarSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <PortalSectionHeader
        eyebrow={t("portal.account")}
        title={t("settingsPanel.title")}
        description={t("settingsPanel.desc")}
      />

      <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold">{t("settingsPanel.basicInfo")}</CardTitle>
          <CardDescription className="text-xs">{t("settingsPanel.basicInfoDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("settingsPanel.fieldUsername")}</label>
              <div className="font-semibold text-foreground text-sm">{user.name || "—"}</div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("settingsPanel.fieldDisplayName")}</label>
              <div className="font-semibold text-foreground text-sm">{user.displayName || "—"}</div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("settingsPanel.fieldEmail")}</label>
              <div className="font-semibold text-foreground text-sm">{user.email || "—"}</div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("settingsPanel.fieldRole")}</label>
              <div>
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] font-semibold flex items-center gap-1 w-fit">
                  <User className="h-3 w-3" />
                  <span>{t("common.roleStudent")}</span>
                </Badge>
              </div>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("settingsPanel.fieldUserId")}</label>
              <div className="font-mono text-xs bg-muted/40 p-2.5 rounded-xl border border-border/40 break-all select-all">{user.userId}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold">{t("settingsPanel.avatar")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pt-2 sm:flex-row sm:items-start">
          <Avatar className="h-16 w-16 border border-border/80 shadow-inner">
            <AvatarImage src={avatarDraft.trim() || user.avatar} />
            <AvatarFallback className="text-xl bg-primary/10 text-primary font-bold">{user.displayName?.[0] || user.name?.[0] || "U"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("settingsPanel.avatarDesc")}
            </p>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {t("settingsPanel.avatarUrl")}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="url"
                  value={avatarDraft}
                  onChange={(e) => {
                    setAvatarDraft(e.target.value);
                    setAvatarMessage("");
                  }}
                  placeholder={t("settingsPanel.avatarUrlPlaceholder")}
                  className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 text-sm rounded-xl"
                />
                <Button
                  type="button"
                  className="rounded-xl text-xs"
                  disabled={avatarSaving}
                  onClick={() => void handleSaveAvatar()}
                >
                  {avatarSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("settingsPanel.btnSaveAvatar")
                  )}
                </Button>
              </div>
              {avatarMessage && (
                <p className="text-xs text-muted-foreground">{avatarMessage}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-destructive/20 bg-destructive/5 rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-destructive">{t("settingsPanel.security")}</CardTitle>
          <CardDescription className="text-xs text-destructive/80">{t("settingsPanel.securityDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <Button variant="destructive" onClick={onLogout} className="rounded-xl text-xs active:scale-95 transition-all">
            <LogOut className="mr-2 h-4 w-4" /> {t("settingsPanel.btnLogout")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
