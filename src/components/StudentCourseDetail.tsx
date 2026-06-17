"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PlayCircle, Clock, User, BookOpen, MessageSquare, FileText, Loader2 } from "lucide-react";
import { CourseStatusBadge } from "@/components/CourseStatusBadge";
import { canEnterClassroom } from "@/lib/course-status";
import { useTranslation } from "@/lib/i18n/context";
import TimeDisplay from "@/components/TimeDisplay";

const ROOM_TYPE_KEYS: Record<number, string> = {
  0: "common.roomType1v1",
  4: "common.roomTypeSmall",
  2: "common.roomTypeBig",
  10: "common.roomTypePublic",
};

export default function StudentCourseDetail({ 
  course, 
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
  const [remarksValue, setRemarksValue] = useState(course.studentRemarks || "");
  const [savingRemarks, setSavingRemarks] = useState(false);
  const { t } = useTranslation();

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

  const getFileIcon = (ext: string) => {
    const normExt = ext.toLowerCase();
    if (normExt === "pdf") return <FileText className="h-5 w-5 text-red-500 shrink-0" />;
    if (["ppt", "pptx"].includes(normExt)) return <FileText className="h-5 w-5 text-orange-500 shrink-0" />;
    if (["doc", "docx"].includes(normExt)) return <FileText className="h-5 w-5 text-blue-500 shrink-0" />;
    return <FileText className="h-5 w-5 text-muted-foreground shrink-0" />;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 pt-4">
      {/* Header Card */}
      <Card className="border border-border/60 bg-card overflow-hidden relative rounded-2xl shadow-sm">
        <div className="absolute top-[-50%] right-[-10%] w-[300px] h-[300px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
        <CardContent className="p-8 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div className="space-y-4">
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary text-[10px]">
                {t(ROOM_TYPE_KEYS[course.roomType]) || t("common.unknown")}
              </Badge>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">{course.name}</h1>
              
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-4">
                <div className="flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-xl border border-border/40 text-xs font-semibold text-foreground">
                  <User className="h-4 w-4 text-primary" />
                  <span className="text-foreground/80">{t("courseDetail.teacherInfo", { name: course.teacherName })}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-xl border border-border/40 text-xs font-semibold text-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-foreground/80">
                    <TimeDisplay isoString={course.startTime} options={{ month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit" }} />
                  </span>
                </div>
                <CourseStatusBadge status={course.status} />
              </div>
            </div>
            
            <div className="w-full md:w-auto shrink-0">
              <Button
                size="lg"
                className="w-full md:w-auto bg-primary hover:bg-primary/95 text-white rounded-xl font-medium shadow-sm active:scale-[0.98] transition-all"
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
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-current" />
                    {t("teacherDashboard.btnEntering")}
                  </span>
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
      <Tabs defaultValue="info" className="w-full">
        <TabsList className="bg-muted/60 border border-border/40 p-1 rounded-xl mb-6 inline-flex w-full md:w-auto">
          <TabsTrigger value="info" className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium text-sm">
            <BookOpen className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.info")}
          </TabsTrigger>
          <TabsTrigger value="courseware" className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium text-sm">
            <FileText className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.courseware")}
          </TabsTrigger>
          <TabsTrigger value="requirements" className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium text-sm">
            <MessageSquare className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.requirements")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-0">
          <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold">{t("courseDetail.courseDescription")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {course.description || t("courseDetail.noDescription")}
              </p>
              
              <div className="mt-8 pt-6 border-t border-border/40">
                 <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary"/> {t("courseDetail.tabs.courseware")}</h4>
                 <p className="text-xs text-primary bg-primary/5 border border-primary/10 p-3.5 rounded-xl leading-relaxed">
                   {t("courseDetail.coursewareAlert")}
                 </p>
              </div>
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
              {courseware.length === 0 ? (
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
                        {item.taskStatus === "Finished" ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px]">
                            {t("courseDetail.ready")}
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[10px]">
                            {t("courseDetail.preparing")}
                          </Badge>
                        )}
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-primary hover:bg-primary/95 text-white text-xs px-3.5 py-2 rounded-xl font-medium shadow-sm transition-all"
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
          <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold">{t("courseDetail.requirementsTitle")}</CardTitle>
              <CardDescription className="text-xs">
                {t("courseDetail.requirementsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea 
                className="min-h-[150px] bg-background border-border/80 focus-visible:ring-primary/50 resize-none text-sm p-4 rounded-xl"
                value={remarksValue}
                onChange={e => setRemarksValue(e.target.value)}
                placeholder={t("courseDetail.requirementsPlaceholder")}
              />
              <div className="mt-6 flex justify-end">
                <Button 
                  className="bg-primary hover:bg-primary/95 text-white rounded-xl shadow-sm active:scale-[0.98] transition-all font-medium text-xs px-4 py-2.5" 
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
