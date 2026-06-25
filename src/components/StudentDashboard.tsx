"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { BookOpen, Settings, LogOut, Calendar, Clock, User, Pencil, PlayCircle, Loader2, Info, FileText, MessageSquare, ExternalLink, Key } from "lucide-react";
import { CourseStatusBadge } from "@/components/CourseStatusBadge";
import { CourseStatus, isUpcomingStatus, canEnterClassroom } from "@/lib/course-status";
import { useTranslation } from "@/lib/i18n/context";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import TimeDisplay from "@/components/TimeDisplay";
import { buildAccessDeniedUrl } from "@/lib/access-denied-codes";

interface Course {
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
  createdAt: string;
  updatedAt: string;
  recordUrl?: string | null;
  requiresPasscode?: boolean;
  publicListing?: boolean;
}

const ROOM_TYPE_KEYS: Record<number, string> = {
  0: "common.roomType1v1",
  4: "common.roomTypeSmall",
  2: "common.roomTypeBig",
  10: "common.roomTypePublic",
};

type SidebarPage = "learning" | "settings";

export default function StudentDashboard({ courses, user, fetchCourses }: { courses: Course[], user: any, fetchCourses: () => void }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [activePage, setActivePage] = useState<SidebarPage>("learning");
  const [activeTab, setActiveTab] = useState<"upcoming" | "finished" | "cancelled">("upcoming");
  
  // Inline remarks edit on dashboard
  const [editingRemarks, setEditingRemarks] = useState<string | null>(null);
  const [remarksValue, setRemarksValue] = useState("");
  
  // Dashboard join inputs
  const [joinCourseId, setJoinCourseId] = useState("");
  const [joining, setJoining] = useState(false);
  
  // Direct entering spinner
  const [enteringCourseId, setEnteringCourseId] = useState<string | null>(null);

  // Dialog course details state
  const [selectedDetailCourse, setSelectedDetailCourse] = useState<Course | null>(null);
  const [detailCourseware, setDetailCourseware] = useState<any[]>([]);
  const [loadingCourseware, setLoadingCourseware] = useState(false);
  const [dialogRemarksValue, setDialogRemarksValue] = useState("");
  const [savingDialogRemarks, setSavingDialogRemarks] = useState(false);

  const { t } = useTranslation();

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
          alert(err);
        }
      } catch (err) {
        console.error(err);
        alert(t("common.failed"));
      } finally {
        setJoining(false);
      }
    } else {
      const isUuid = cid.length === 36 || cid.length === 32;
      if (!isUuid) {
        alert(t("studentDashboard.errInvalidCourseId"));
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

  const handleStatusChange = async (courseId: string, status: string) => {
    if (!confirm(t("studentDashboard.confirmCancelCourse"))) return;
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchCourses();
        if (selectedDetailCourse?.id === courseId) {
          setSelectedDetailCourse(prev => prev ? { ...prev, status } : null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveRemarks = async (courseId: string, remarksVal: string, isFromDialog = false) => {
    if (isFromDialog) setSavingDialogRemarks(true);
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentRemarks: remarksVal })
      });
      if (res.ok) {
        setEditingRemarks(null);
        fetchCourses();
        if (isFromDialog && selectedDetailCourse) {
          setSelectedDetailCourse({ ...selectedDetailCourse, studentRemarks: remarksVal });
          alert(t("courseDetail.updateRemarksSuccess"));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (isFromDialog) setSavingDialogRemarks(false);
    }
  };

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
      if (!res.ok) {
        alert(t("classroom.verifyFailed"));
        setEnteringCourseId(null);
        return;
      }
      const data = await res.json();

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

      const roomUuid = course.id.replace(/-/g, "").slice(0, 16);
      const params = new URLSearchParams({
        roomUuid,
        roomType: String(course.roomType),
        roomName: course.name,
        courseId: course.id,
      });
      router.push(`/classroom?${params.toString()}`);
    } catch (err) {
      console.error(err);
      alert(t("classroom.verifyFailed"));
      setEnteringCourseId(null);
    }
  };

  // Dialog details courseware load
  useEffect(() => {
    if (!selectedDetailCourse) {
      setDetailCourseware([]);
      return;
    }
    setDialogRemarksValue(selectedDetailCourse.studentRemarks || "");
    let active = true;
    const loadCw = async () => {
      setLoadingCourseware(true);
      try {
        const res = await fetch(`/api/courses/${selectedDetailCourse.id}/courseware`);
        if (res.ok && active) {
          const data = await res.json();
          setDetailCourseware(data.courseware ?? []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (active) setLoadingCourseware(false);
      }
    };
    loadCw();
    return () => {
      active = false;
    };
  }, [selectedDetailCourse]);

  return (
    <div className="min-h-screen bg-background flex flex-col transition-colors duration-300">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-card/60 backdrop-blur-md px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary animate-pulse" />
            <span className="font-extrabold text-lg bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              {t("common.appName") || "在线课堂"}
            </span>
          </div>
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 flex items-center gap-1 text-[10px] font-semibold">
            <User className="h-3 w-3" />
            <span>{t("common.roleStudent")}</span>
          </Badge>
        </div>

        {/* Center: Apple-style segment controller buttons */}
        <div className="hidden md:flex bg-muted/60 border border-border/40 p-1 rounded-xl">
          <Button 
            variant="ghost" 
            size="sm"
            className={`rounded-lg font-medium px-4 py-1 text-xs transition-all ${activePage === 'learning' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActivePage('learning')}
          >
            <BookOpen className="mr-1.5 h-3.5 w-3.5" /> {t("studentDashboard.learningCenter")}
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            className={`rounded-lg font-medium px-4 py-1 text-xs transition-all ${activePage === 'settings' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActivePage('settings')}
          >
            <Settings className="mr-1.5 h-3.5 w-3.5" /> {t("studentDashboard.settings")}
          </Button>
        </div>

        {/* Right side: Global settings & user profile */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>

          <div className="flex items-center gap-3 border-l border-border/40 pl-4">
            <Avatar className="h-8 w-8 border border-primary/20 shadow-sm">
              <AvatarImage src={user.avatar} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{user.displayName?.[0] || 'S'}</AvatarFallback>
            </Avatar>
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-semibold text-foreground truncate max-w-[100px]">{user.displayName || user.name}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive h-8 w-8 hover:bg-destructive/10 rounded-lg transition-colors"
              onClick={logout}
              title={t("common.logout")}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full relative">
        {/* Mobile Page Selector */}
        <div className="flex md:hidden bg-muted/60 border border-border/40 p-1 rounded-xl mb-6">
          <Button 
            variant="ghost" 
            size="sm"
            className={`flex-1 rounded-lg font-medium py-2 text-xs transition-all ${activePage === 'learning' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setActivePage('learning')}
          >
            <BookOpen className="mr-1 h-3.5 w-3.5" /> {t("studentDashboard.learningCenter")}
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            className={`flex-1 rounded-lg font-medium py-2 text-xs transition-all ${activePage === 'settings' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setActivePage('settings')}
          >
            <Settings className="mr-1 h-3.5 w-3.5" /> {t("studentDashboard.settings")}
          </Button>
        </div>
        
        {activePage === "learning" && (
          <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Elegant banner */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-primary to-indigo-600 p-8 text-white shadow-md">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_120%,rgba(255,255,255,0.15),transparent_60%)] pointer-events-none" />
              <div className="relative z-10 max-w-xl">
                <h2 className="text-3xl font-extrabold tracking-tight mb-2">{t("studentDashboard.bannerTitle")}</h2>
                <p className="text-white/80 font-medium leading-relaxed">{t("studentDashboard.bannerDesc")}</p>
              </div>
            </div>

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

            <Tabs defaultValue="upcoming" className="w-full" onValueChange={(v) => setActiveTab(v as any)}>
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
                              <TimeDisplay isoString={course.startTime} />
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
                                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
                                    <User className="h-3.5 w-3.5" />
                                    <span>{t("courseDetail.teacherInfo", { name: course.teacherName })}</span>
                                  </div>
                                </div>
                                
                                {activeTab === 'upcoming' && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive rounded-lg h-8 px-2.5 text-xs font-medium active:scale-95" 
                                    onClick={(e) => { e.stopPropagation(); handleStatusChange(course.id, "cancelled"); }}
                                  >
                                    {t("studentDashboard.askForLeave")}
                                  </Button>
                                )}
                              </div>
                              
                              {/* Remarks */}
                              <div className="mt-3 bg-muted/20 border border-border/40 rounded-xl p-3 text-xs">
                                <div className="flex items-center gap-1.5 font-medium text-foreground mb-1">
                                  <Pencil className="h-3.5 w-3.5 text-primary" />
                                  <span>{t("studentDashboard.myRemarks")}</span>
                                </div>
                                {editingRemarks === course.id ? (
                                  <div className="flex gap-2 mt-1.5">
                                    <Input 
                                      className="h-8 bg-background border-border/60 text-xs rounded-lg" 
                                      value={remarksValue} 
                                      onChange={(e) => setRemarksValue(e.target.value)} 
                                      placeholder={t("studentDashboard.remarksPlaceholder")}
                                    />
                                    <Button size="sm" className="h-8 text-xs rounded-lg px-3" onClick={() => handleSaveRemarks(course.id, remarksValue)}>{t("common.save")}</Button>
                                    <Button size="sm" variant="ghost" className="h-8 text-xs rounded-lg px-2" onClick={() => setEditingRemarks(null)}>{t("common.cancel")}</Button>
                                  </div>
                                ) : (
                                  <div className="flex justify-between items-center group/remark">
                                    <span className="text-muted-foreground italic truncate w-[90%]">{course.studentRemarks || t("studentDashboard.remarksEmpty")}</span>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover/remark:opacity-100 transition-opacity rounded-md" onClick={(e) => { e.stopPropagation(); setEditingRemarks(course.id); setRemarksValue(course.studentRemarks); }}>
                                      <Pencil className="h-3 w-3 text-muted-foreground" />
                                    </Button>
                                  </div>
                                )}
                              </div>
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
                                disabled={isEntering || (course.status === "finished" ? !course.recordUrl : !joinable)}
                                className={`rounded-xl px-5 py-2.5 font-medium shadow-sm text-sm active:scale-[0.98] transition-all flex items-center gap-1.5 ${
                                  course.status === "finished"
                                    ? "bg-muted text-foreground border border-border/80 hover:bg-muted/80"
                                    : "bg-primary hover:bg-primary/95 text-white"
                                }`}
                                onClick={() => {
                                  if (course.status === "finished") {
                                    if (course.recordUrl) window.open(course.recordUrl, "_blank");
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
                                        ? (course.recordUrl ? t("studentDashboard.viewPlayback") : t("studentDashboard.livePlayback"))
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
                <DialogDescription className="text-xs text-muted-foreground font-medium flex items-center gap-1 mt-1">
                  <User className="h-3.5 w-3.5" />
                  <span>{t("courseDetail.teacherInfo", { name: selectedDetailCourse.teacherName })}</span>
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="info" className="w-full mt-2">
                <TabsList className="bg-muted/50 border border-border/40 p-0.5 rounded-lg w-full flex">
                  <TabsTrigger value="info" className="flex-1 text-xs rounded-md py-1.5"><Info className="h-3.5 w-3.5 mr-1" />{t("courseDetail.tabs.info")}</TabsTrigger>
                  <TabsTrigger value="courseware" className="flex-1 text-xs rounded-md py-1.5"><FileText className="h-3.5 w-3.5 mr-1" />{t("courseDetail.tabs.courseware")}</TabsTrigger>
                  <TabsTrigger value="remarks" className="flex-1 text-xs rounded-md py-1.5"><MessageSquare className="h-3.5 w-3.5 mr-1" />{t("courseDetail.tabs.requirements")}</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="space-y-4 pt-3 outline-none text-sm">
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 bg-muted/20 border border-border/40 rounded-xl p-3">
                      <Clock className="h-4.5 w-4.5 text-primary mt-0.5" />
                      <div className="space-y-0.5 flex-1">
                        <span className="text-xs text-muted-foreground font-medium block">Class Time</span>
                        <div className="font-semibold text-foreground text-sm">
                          <TimeDisplay isoString={selectedDetailCourse.startTime} options={{ month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit" }} />
                        </div>

                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground font-medium">Description</span>
                      <p className="text-foreground/80 leading-relaxed bg-muted/10 p-3.5 border border-border/40 rounded-xl">
                        {selectedDetailCourse.description || "No description provided."}
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="courseware" className="pt-3 outline-none max-h-56 overflow-y-auto custom-scrollbar">
                  {loadingCourseware ? (
                    <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                  ) : detailCourseware.length === 0 ? (
                    <div className="text-center p-8 border border-dashed border-border/60 rounded-xl"><p className="text-xs text-muted-foreground">No courseware uploaded for this class.</p></div>
                  ) : (
                    <div className="space-y-2">
                      {detailCourseware.map((cw) => (
                        <div key={cw.id} className="flex justify-between items-center p-3 border border-border/60 rounded-xl bg-card hover:bg-muted/20 transition-colors">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <span className="text-xs font-semibold text-foreground truncate max-w-xs">{cw.name}</span>
                            <Badge variant="outline" className="text-[9px] uppercase border-border/80">{cw.ext}</Badge>
                          </div>
                          <Button size="sm" variant="ghost" className="h-7 text-xs rounded-md flex items-center gap-1 text-primary hover:text-primary-foreground hover:bg-primary" onClick={() => window.open(cw.url, "_blank")}>
                            <span>View</span>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="remarks" className="space-y-3 pt-3 outline-none">
                  <span className="text-xs text-muted-foreground font-medium">My Remarks & Learning Requests</span>
                  <textarea
                    rows={4}
                    className="w-full bg-background border border-border/80 rounded-xl p-3 text-xs leading-relaxed focus:ring-2 focus:ring-primary/40 focus:outline-none"
                    placeholder={t("studentDashboard.remarksPlaceholder")}
                    value={dialogRemarksValue}
                    onChange={(e) => setDialogRemarksValue(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button size="sm" className="rounded-lg h-8 px-4 text-xs font-medium active:scale-95" disabled={savingDialogRemarks || dialogRemarksValue === selectedDetailCourse.studentRemarks} onClick={() => handleSaveRemarks(selectedDetailCourse.id, dialogRemarksValue, true)}>
                      {savingDialogRemarks ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      {t("common.save")}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter className="pt-4 border-t border-border/40 gap-2 sm:gap-0 mt-4 flex items-center justify-between w-full">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground rounded-lg h-9" onClick={() => router.push(`/courses/${selectedDetailCourse.id}`)}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  Dedicated Page
                </Button>
                
                <div className="flex gap-2">
                  <Button variant="secondary" className="rounded-xl h-9 text-xs" onClick={() => setSelectedDetailCourse(null)}>
                    {t("common.cancel")}
                  </Button>
                  <Button 
                    disabled={enteringCourseId === selectedDetailCourse.id || (selectedDetailCourse.status === "finished" ? !selectedDetailCourse.recordUrl : !canEnterClassroom(selectedDetailCourse.status))}
                    className="bg-primary hover:bg-primary/95 text-white rounded-xl h-9 text-xs font-semibold shadow-sm active:scale-[0.98]"
                    onClick={() => {
                      const course = selectedDetailCourse;
                      setSelectedDetailCourse(null);
                      if (course.status === "finished") {
                        if (course.recordUrl) window.open(course.recordUrl, "_blank");
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
                      ? (selectedDetailCourse.recordUrl ? t("studentDashboard.viewPlayback") : t("studentDashboard.livePlayback"))
                      : t("studentDashboard.enterClassroom")}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsPanel({ user, onLogout }: { user: any; onLogout: () => void }) {
  const { t, locale } = useTranslation();

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="mb-6">
        <h2 className="text-3xl font-extrabold tracking-tight">{t("settingsPanel.title")}</h2>
        <p className="text-muted-foreground mt-1 text-sm font-medium">{t("settingsPanel.desc")}</p>
      </div>

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
        <CardContent className="flex items-center gap-6 pt-2">
          <Avatar className="h-16 w-16 border border-border/80 shadow-inner">
            <AvatarImage src={user.avatar} />
            <AvatarFallback className="text-xl bg-primary/10 text-primary font-bold">{user.displayName?.[0] || user.name?.[0] || "U"}</AvatarFallback>
          </Avatar>
          <div className="text-xs text-muted-foreground leading-relaxed">
            {t("settingsPanel.avatarDesc")}
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
