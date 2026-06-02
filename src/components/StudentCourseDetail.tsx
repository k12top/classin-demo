"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PlayCircle, Clock, User, BookOpen, MessageSquare, AlertCircle, FileText, Loader2 } from "lucide-react";
import { CourseStatusBadge } from "@/components/CourseStatusBadge";
import { canEnterClassroom } from "@/lib/course-status";
import { useTranslation } from "@/lib/i18n/context";

const ROOM_TYPE_KEYS: Record<number, string> = {
  0: "common.roomType1v1",
  4: "common.roomTypeSmall",
  2: "common.roomTypeBig",
};

export default function StudentCourseDetail({ 
  course, 
  user,
  onEnterClassroom,
  enterLoading,
  fetchCourse
}: { 
  course: any; 
  user: any; 
  onEnterClassroom: () => void;
  enterLoading: boolean;
  fetchCourse: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"info" | "requirements" | "courseware">("info");
  const [remarksValue, setRemarksValue] = useState(course.studentRemarks || "");
  const [savingRemarks, setSavingRemarks] = useState(false);
  const { t, locale } = useTranslation();

  const [courseware, setCourseware] = useState<any[]>([]);

  const fetchCourseware = useCallback(async () => {
    try {
      const res = await fetch(`/api/courses/${course.id}/courseware`);
      if (res.ok) {
        const data = await res.json();
        setCourseware(data.courseware ?? []);
      }
    } catch (e) {
      console.error("Failed to fetch courseware:", e);
    }
  }, [course.id]);

  useEffect(() => {
    fetchCourseware();
  }, [fetchCourseware]);

  const formatTime = (isoString: string | null) => {
    if (!isoString) return t("common.timeUndetermined");
    const date = new Date(isoString);
    return date.toLocaleString(locale, { month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit' });
  };

  const handleSaveRemarks = async () => {
    setSavingRemarks(true);
    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentRemarks: remarksValue })
      });
      if (res.ok) {
        fetchCourse();
        alert(t("courseDetail.updateRemarksSuccess"));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingRemarks(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 pt-4">
      {/* Header Card */}
      <Card className="glass-panel border-white/10 bg-gradient-to-br from-blue-900/40 to-black/40 overflow-hidden relative">
        <div className="absolute top-[-50%] right-[-10%] w-[300px] h-[300px] bg-blue-500/20 rounded-full blur-[100px] pointer-events-none" />
        <CardContent className="p-8 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div className="space-y-4">
              <Badge variant="outline" className="border-blue-400/30 text-blue-300 bg-blue-500/10">
                {t(ROOM_TYPE_KEYS[course.roomType]) || t("common.unknown")}
              </Badge>
              <h1 className="text-3xl md:text-4xl font-bold text-white">{course.name}</h1>
              
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-4">
                <div className="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-md border border-white/5">
                  <User className="h-4 w-4 text-blue-400" />
                  <span className="font-medium text-foreground">{t("courseDetail.teacherInfo", { name: course.teacherName })}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-md border border-white/5">
                  <Clock className="h-4 w-4 text-blue-400" />
                  <span className="font-medium text-foreground">{formatTime(course.startTime)}</span>
                </div>
                <CourseStatusBadge status={course.status} />
              </div>
            </div>
            
            <div className="w-full md:w-auto shrink-0">
              <Button
                size="lg"
                className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white shadow-glow-blue"
                onClick={() => {
                  if (course.status === "finished") {
                    if (course.recordUrl) {
                      window.open(course.recordUrl, "_blank");
                    }
                  } else {
                    onEnterClassroom();
                  }
                }}
                disabled={enterLoading || (course.status === "finished" ? !course.recordUrl : !canEnterClassroom(course.status))}
              >
                {enterLoading ? (
                  <span className="flex items-center gap-2"><span className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white" /> {t("teacherDashboard.btnEntering")}</span>
                ) : course.status === "finished" ? (
                  <span className="flex items-center gap-2">
                    <PlayCircle className="h-5 w-5" />
                    {course.recordUrl ? t("studentDashboard.viewPlayback") : t("studentDashboard.livePlayback")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2"><PlayCircle className="h-5 w-5" /> {t("studentDashboard.enterClassroom")}</span>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs Area */}
      <Tabs defaultValue="info" className="w-full" onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="bg-black/20 border border-white/5 backdrop-blur-md mb-6 inline-flex w-full md:w-auto">
          <TabsTrigger value="info" className="flex-1 md:flex-none data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300">
            <BookOpen className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.info")}
          </TabsTrigger>
          <TabsTrigger value="courseware" className="flex-1 md:flex-none data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300">
            <FileText className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.courseware")}
          </TabsTrigger>
          <TabsTrigger value="requirements" className="flex-1 md:flex-none data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300">
            <MessageSquare className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.requirements")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-0">
          <Card className="glass-panel border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle>{t("courseDetail.courseDescription")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                {course.description || t("courseDetail.noDescription")}
              </p>
              
              <div className="mt-8 pt-6 border-t border-white/5">
                 <h4 className="font-semibold mb-2 flex items-center gap-2"><BookOpen className="h-4 w-4 text-blue-400"/> {t("courseDetail.tabs.courseware")}</h4>
                 <p className="text-sm text-muted-foreground bg-blue-500/10 border border-blue-500/20 p-3 rounded-md">
                   {t("courseDetail.coursewareAlert")}
                 </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="courseware" className="mt-0">
          <Card className="glass-panel border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-xl">{t("courseDetail.tabs.courseware")}</CardTitle>
              <CardDescription>{t("courseDetail.noCoursewareDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {courseware.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-lg bg-black/10">
                  <FileText className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">{t("courseDetail.noCourseware")}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">{t("courseDetail.noCoursewareDescStudent")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {courseware.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-black/20 border border-white/5 hover:border-white/10 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">
                          {item.ext === "pdf" ? "📕" : ["ppt", "pptx"].includes(item.ext) ? "📙" : "📄"}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-white">{item.name}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{t("teacherDashboard.fieldType")}: {item.ext.toUpperCase()}</span>
                            <span>•</span>
                            <span>{t("teacherDashboard.memberCount")}: {item.size ? `${(item.size / 1024 / 1024).toFixed(2)} MB` : t("common.unknown")}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {item.taskStatus === "Finished" ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            {t("courseDetail.ready")}
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            {t("courseDetail.preparing")}
                          </Badge>
                        )}
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-md font-medium shadow-glow-blue transition-all"
                        >
                          {t("courseDetail.openFile")}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requirements" className="mt-0">
          <Card className="glass-panel border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle>{t("courseDetail.requirementsTitle")}</CardTitle>
              <CardDescription>
                {t("courseDetail.requirementsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea 
                className="min-h-[150px] bg-black/40 border-white/10 resize-none text-base p-4"
                value={remarksValue}
                onChange={e => setRemarksValue(e.target.value)}
                placeholder={t("courseDetail.requirementsPlaceholder")}
              />
              <div className="mt-6 flex justify-end">
                <Button 
                  className="bg-blue-600 hover:bg-blue-700" 
                  onClick={handleSaveRemarks}
                  disabled={savingRemarks}
                >
                  {savingRemarks ? t("common.saving") : t("courseDetail.btnSaveRequirements")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
