"use client";

import { useState, useEffect, useCallback } from "react";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayCircle, Clock, Users, Link as LinkIcon, MessageSquare, Search, Trash2, UserPlus, Info, Check, Copy, BookOpen, FileText, Loader2 } from "lucide-react";
import { CourseStatusBadge } from "@/components/CourseStatusBadge";
import { canEnterClassroom, CourseStatus } from "@/lib/course-status";
import { useTranslation } from "@/lib/i18n/context";

const ROOM_TYPE_KEYS: Record<number, string> = {
  0: "common.roomType1v1",
  4: "common.roomTypeSmall",
  2: "common.roomTypeBig",
};

interface GroupNode {
  id: string;
  name: string;
  members: { userId: string; userName?: string }[];
  children?: GroupNode[];
}

function countNestedMembers(g: GroupNode): number {
  let n = g.members?.length ?? 0;
  for (const c of g.children ?? []) {
    n += countNestedMembers(c);
  }
  return n;
}

function flattenGroups(roots: GroupNode[], prefix = ""): { id: string; label: string }[] {
  const rows: { id: string; label: string }[] = [];
  for (const g of roots) {
    const label = prefix ? `${prefix} / ${g.name}` : g.name;
    rows.push({ id: g.id, label });
    if (g.children?.length) {
      rows.push(...flattenGroups(g.children, label));
    }
  }
  return rows;
}

export default function TeacherCourseDetail({ 
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
  const { t, locale } = useTranslation();
  const [activeTab, setActiveTab] = useState<"members" | "sharing" | "requirements" | "courseware">("members");

  // Search / add students
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; displayName: string; email: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Groups
  const [myGroups, setMyGroups] = useState<GroupNode[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [memberTargetGroupId, setMemberTargetGroupId] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);

  // Links
  const [joinLinks, setJoinLinks] = useState<any[]>([]);
  const [joinLinkBusy, setJoinLinkBusy] = useState(false);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [copyHint, setCopyHint] = useState("");

  // Courseware Tab State
  const [courseware, setCourseware] = useState<any[]>([]);
  const [cwName, setCwName] = useState("");
  const [cwUrl, setCwUrl] = useState("");
  const [cwExt, setCwExt] = useState("pptx");
  const [cwAdding, setCwAdding] = useState(false);
  const [cwError, setCwError] = useState("");

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
    if (casdoorUserIdsMatch(course.teacherId, user.userId)) {
      fetchCourseware();
    }
  }, [course.teacherId, user.userId, fetchCourseware]);

  // Poll for conversions every 4 seconds if there are items converting
  useEffect(() => {
    const hasConverting = courseware.some(
      (item) => item.taskStatus === "Pending" || item.taskStatus === "Converting"
    );
    if (!hasConverting) return;

    const timer = setInterval(() => {
      fetchCourseware();
    }, 4000);

    return () => clearInterval(timer);
  }, [courseware, fetchCourseware]);

  const handleAddCourseware = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cwName.trim()) { setCwError(t("courseDetail.errCwNameEmpty")); return; }
    
    // Provide a beautiful default sample URL if left empty
    const fileUrl = cwUrl.trim() || "https://solutions-apaas.agora.io/static/courseware.pptx";
    
    setCwAdding(true);
    setCwError("");
    try {
      const res = await fetch(`/api/courses/${course.id}/courseware`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cwName.trim(),
          url: fileUrl,
          ext: cwExt,
          size: 1024 * 1024 * 5, // mock 5MB
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("courseDetail.errCwAddFailed"));
      }
      
      setCwName("");
      setCwUrl("");
      setCwError("");
      fetchCourseware();
    } catch (err) {
      setCwError(err instanceof Error ? err.message : t("courseDetail.errCwAddFailed"));
    } finally {
      setCwAdding(false);
    }
  };

  /** 一对一 (roomType 0) 仅支持直配学生，不使用学生组。 */
  const supportsStudentGroups = course.roomType !== 0;

  const fetchMyGroups = useCallback(async () => {
    const res = await fetch("/api/groups", { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      setMyGroups(data.groups ?? []);
    }
  }, []);

  const fetchJoinLinks = useCallback(async () => {
    const res = await fetch(`/api/courses/${course.id}/join-links`, {
      credentials: "same-origin",
    });
    if (res.ok) {
      const data = await res.json();
      setJoinLinks(data.links ?? []);
    }
  }, [course.id]);

  useEffect(() => {
    if (casdoorUserIdsMatch(course.teacherId, user.userId)) {
      if (supportsStudentGroups) fetchMyGroups();
      fetchJoinLinks();
    }
  }, [
    course.teacherId,
    course.roomType,
    user.userId,
    fetchMyGroups,
    fetchJoinLinks,
    supportsStudentGroups,
  ]);

  const copyText = async (text: string, hint: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(hint);
      setTimeout(() => setCopyHint(""), 2000);
    } catch {
      setCopyHint(t("courseDetail.copyFailed"));
    }
  };

  const handleCreateJoinLink = async () => {
    setJoinLinkBusy(true);
    try {
      const res = await fetch(`/api/courses/${course.id}/join-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ label: newLinkLabel.trim() || undefined }),
      });
      if (res.ok) {
        setNewLinkLabel("");
        await fetchJoinLinks();
        const data = await res.json();
        if (data.link?.joinUrl) {
          await copyText(data.link.joinUrl, t("courseDetail.shareLinkCreatedAndCopied"));
        }
      }
    } finally {
      setJoinLinkBusy(false);
    }
  };

  const handleRevokeJoinLink = async (linkId: string) => {
    if (!confirm(t("courseDetail.confirmRevokeLink"))) return;
    setJoinLinkBusy(true);
    try {
      await fetch(`/api/courses/${course.id}/join-links/${linkId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      await fetchJoinLinks();
    } finally {
      setJoinLinkBusy(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError("");
    try {
      const res = await fetch(
        `/api/users/search?q=${encodeURIComponent(searchQuery)}`,
        { credentials: "same-origin" }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSearchResults(data.users ?? []);
        if (!data.users?.length) {
          setSearchError(t("teacherDashboard.searchUserNotFound"));
        }
      } else {
        setSearchResults([]);
        setSearchError(data.hint || data.error || `${t("common.failed")} (${res.status})`);
      }
    } catch {
      setSearchResults([]);
      setSearchError(t("common.failed"));
    } finally {
      setSearching(false);
    }
  };

  const handleAddStudent = async (studentId: string, studentName: string) => {
    try {
      const res = await fetch(`/api/courses/${course.id}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students: [{ studentId, studentName }] }),
      });
      if (res.ok) {
        fetchCourse();
        setSearchResults((prev) => prev.filter((u) => u.id !== studentId));
      }
    } catch { }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!confirm(t("courseDetail.confirmRemoveStudent"))) return;
    try {
      await fetch(`/api/courses/${course.id}/students`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      fetchCourse();
    } catch { }
  };

  const linkedGroupIdSet = course ? new Set(course.groupLinks.map((l: any) => l.group.id)) : new Set<string>();

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setGroupBusy(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name }),
      });
      if (res.ok) {
        setNewGroupName("");
        await fetchMyGroups();
      }
    } finally {
      setGroupBusy(false);
    }
  };

  const handleLinkGroupToCourse = async (groupId: string) => {
    setGroupBusy(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "linkToCourse",
          groupId,
          courseId: course.id,
        }),
      });
      if (res.ok) await fetchCourse();
    } finally {
      setGroupBusy(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm(t("teacherDashboard.deleteGroupConfirm"))) return;
    setGroupBusy(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", groupId }),
      });
      if (res.ok) {
        await fetchMyGroups();
        await fetchCourse();
      }
    } finally {
      setGroupBusy(false);
    }
  };

  const handleAddUserToGroup = async (u: { id: string; name: string; displayName: string }) => {
    if (!memberTargetGroupId) {
      alert(t("teacherDashboard.selectTargetGroup"));
      return;
    }
    setGroupBusy(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addMembers",
          groupId: memberTargetGroupId,
          members: [{ userId: u.id, userName: u.displayName || u.name }],
        }),
      });
      if (res.ok) await fetchMyGroups();
    } finally {
      setGroupBusy(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    const statusText = status === 'finished' ? t("teacherDashboard.statusFinished") : t("teacherDashboard.statusCancelled");
    if (!confirm(t("teacherDashboard.confirmFinishCancel", { status: statusText }))) return;
    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchCourse();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return t("common.timeUndetermined");
    const date = new Date(isoString);
    return date.toLocaleString(locale, { month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 pt-4">
      {/* Header Card */}
      <Card className="glass-panel border-white/10 bg-gradient-to-br from-purple-900/40 to-black/40 overflow-hidden relative">
        <div className="absolute top-[-50%] right-[-10%] w-[400px] h-[400px] bg-purple-500/20 rounded-full blur-[120px] pointer-events-none" />
        <CardContent className="p-8 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div className="space-y-4 flex-1">
              <Badge variant="outline" className="border-purple-400/30 text-purple-300 bg-purple-500/10">
                {t(ROOM_TYPE_KEYS[course.roomType]) || t("common.unknown")}
              </Badge>
              <h1 className="text-3xl md:text-4xl font-bold text-white">{course.name}</h1>
              
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-4">
                <div className="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-md border border-white/5">
                  <Users className="h-4 w-4 text-purple-400" />
                  <span className="font-medium text-foreground">{t("courseDetail.studentCount", { count: course.students.length })}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-md border border-white/5">
                  <Clock className="h-4 w-4 text-purple-400" />
                  <span className="font-medium text-foreground">{formatTime(course.startTime)}</span>
                </div>
                <CourseStatusBadge status={course.status} />
              </div>
            </div>
            
            <div className="flex flex-col gap-3 w-full md:w-auto shrink-0">
              <Button
                size="lg"
                className="w-full bg-purple-600 hover:bg-purple-700 text-white shadow-glow-purple"
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
                  <span className="flex items-center gap-2"><PlayCircle className="h-5 w-5" /> {t("teacherDashboard.btnEnterClass")}</span>
                )}
              </Button>
              {canEnterClassroom(course.status) && (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="border-white/10 hover:bg-white/10 text-white" onClick={() => handleStatusChange(CourseStatus.FINISHED)}>
                    {t("courseDetail.btnFinishCourse")}
                  </Button>
                  <Button variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => handleStatusChange(CourseStatus.CANCELLED)}>
                    {t("courseDetail.btnCancelCourse")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs Area */}
      <Tabs defaultValue="members" className="w-full" onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="bg-black/20 border border-white/5 backdrop-blur-md mb-6 inline-flex w-full md:w-auto overflow-x-auto no-scrollbar">
          <TabsTrigger value="members" className="flex-1 md:flex-none data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 whitespace-nowrap">
            <Users className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.members")}
          </TabsTrigger>
          <TabsTrigger value="courseware" className="flex-1 md:flex-none data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 whitespace-nowrap">
            <BookOpen className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.coursewareManage")}
          </TabsTrigger>
          <TabsTrigger value="sharing" className="flex-1 md:flex-none data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 whitespace-nowrap">
            <LinkIcon className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.sharing")}
          </TabsTrigger>
          <TabsTrigger value="requirements" className="flex-1 md:flex-none data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 whitespace-nowrap">
            <MessageSquare className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.requirementsStudent")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-0">
          <div className={`grid grid-cols-1 ${supportsStudentGroups ? "lg:grid-cols-2" : ""} gap-6`}>
            {/* Left Side: Direct Students */}
            <Card className="glass-panel border-white/10 bg-white/5 flex flex-col h-[600px]">
              <CardHeader className="border-b border-white/5 pb-4 shrink-0">
                <CardTitle className="text-xl">{t("courseDetail.userSearchTitle")}</CardTitle>
                <CardDescription>{t("courseDetail.userSearchDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 flex flex-col overflow-hidden h-full">
                <div className="flex gap-2 shrink-0">
                  <Input
                    placeholder={t("teacherDashboard.searchPlaceholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="bg-black/40 border-white/20 hover:border-white/30 focus-visible:ring-purple-500/50"
                  />
                  <Button className="bg-purple-600 hover:bg-purple-700 text-white shrink-0" onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
                    {searching ? t("teacherDashboard.searching") : t("teacherDashboard.btnSearch")}
                  </Button>
                </div>
                {searchError && <p className="text-sm text-red-400 bg-red-500/10 p-2 mt-3 rounded-md border border-red-500/20 shrink-0">{searchError}</p>}

                {supportsStudentGroups && searchResults.length > 0 && (
                  <div className="mt-4 space-y-2 shrink-0">
                    <label className="text-sm text-muted-foreground font-medium">{t("teacherDashboard.addToGroupLabel")}</label>
                    <Select value={memberTargetGroupId} onValueChange={setMemberTargetGroupId}>
                      <SelectTrigger className="bg-black/40 border-white/20 hover:border-white/30 focus-visible:ring-purple-500/50">
                        <SelectValue placeholder={t("teacherDashboard.selectTargetGroup")} />
                      </SelectTrigger>
                      <SelectContent className="bg-background/95 backdrop-blur-md border-white/10">
                        {flattenGroups(myGroups).map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div className="mt-4 overflow-y-auto pr-2 custom-scrollbar shrink-0 max-h-[150px]">
                    {searchResults.map((u) => {
                      const isAlready = course.students.some((s: any) => casdoorUserIdsMatch(s.studentId, u.id));
                      return (
                        <div key={u.id} className="flex flex-wrap justify-between items-center p-3 rounded-lg bg-black/40 border border-white/5 mb-2 gap-2">
                          <div className="flex flex-col">
                            <span className="font-semibold text-sm">{u.displayName || u.name}</span>
                            <span className="text-xs text-muted-foreground">{u.email}</span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={isAlready ? "outline" : "secondary"}
                              className={isAlready ? "border-white/10 opacity-50" : "bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"}
                              disabled={isAlready}
                              onClick={() => handleAddStudent(u.id, u.displayName || u.name)}
                            >
                              {isAlready ? t("courseDetail.inviteLinkActive") : t("common.add")}
                            </Button>
                            {supportsStudentGroups && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-white/10"
                                disabled={groupBusy || !memberTargetGroupId}
                                onClick={() => void handleAddUserToGroup(u)}
                              >
                                {t("teacherDashboard.btnAddToGroup")}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-6 flex-1 flex flex-col min-h-0">
                  <h4 className="font-semibold flex items-center justify-between text-sm text-muted-foreground mb-3 pb-2 border-b border-white/5">
                    {t("courseDetail.assignedStudents")} <Badge variant="secondary" className="bg-white/10">{course.students.length}</Badge>
                  </h4>
                  {course.students.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center border border-dashed border-white/10 rounded-lg text-muted-foreground text-sm">
                      {t("courseDetail.noAssignedStudents")}
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                      {course.students.map((s: any) => (
                        <div key={s.id} className="flex justify-between items-center p-3 rounded-md bg-black/20 hover:bg-white/5 transition-colors group">
                          <span className="text-sm font-medium">{s.studentName || s.studentId}</span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 hover:bg-red-500/20 transition-all" 
                            onClick={() => handleRemoveStudent(s.studentId)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {supportsStudentGroups && (
              <Card className="glass-panel border-white/10 bg-white/5 flex flex-col h-[600px]">
                <CardHeader className="border-b border-white/5 pb-4 shrink-0">
                  <CardTitle className="text-xl">{t("teacherDashboard.studentGroupManage")}</CardTitle>
                  <CardDescription>{t("teacherDashboard.groupManageDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 flex flex-col overflow-hidden h-full">
                  <div className="flex gap-2 shrink-0">
                    <Input
                      placeholder={t("teacherDashboard.newGroupPlaceholder")}
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                      className="bg-black/40 border-white/20 hover:border-white/30 focus-visible:ring-purple-500/50"
                    />
                    <Button variant="secondary" className="shrink-0" disabled={groupBusy || !newGroupName.trim()} onClick={handleCreateGroup}>
                      {t("teacherDashboard.btnCreate")}
                    </Button>
                  </div>

                  <div className="mt-6 flex-1 flex flex-col min-h-0 overflow-y-auto pr-2 custom-scrollbar space-y-6">
                    <div>
                      <h4 className="font-semibold text-sm text-muted-foreground mb-3 pb-2 border-b border-white/5 flex justify-between">
                        {t("teacherDashboard.allMyGroups")} <Badge variant="secondary" className="bg-white/10">{myGroups.length}</Badge>
                      </h4>
                      {myGroups.length === 0 ? (
                        <div className="p-4 text-center border border-dashed border-white/10 rounded-lg text-muted-foreground text-sm">
                          {t("teacherDashboard.groupEmpty")}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {myGroups.map((g) => (
                            <div key={g.id} className="flex justify-between items-center p-3 rounded-lg bg-black/40 border border-white/5">
                              <div className="flex items-center gap-2">
                                <strong className="text-sm">{g.name}</strong>
                                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-white/10">{countNestedMembers(g)} {t("teacherDashboard.memberCount")}</Badge>
                              </div>
                              <div className="flex gap-2">
                                {!linkedGroupIdSet.has(g.id) && (
                                  <Button size="sm" variant="outline" className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10 h-7 text-xs" disabled={groupBusy} onClick={() => handleLinkGroupToCourse(g.id)}>
                                    {t("courseDetail.btnLinkToCourse")}
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/20" disabled={groupBusy} onClick={() => handleDeleteGroup(g.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="font-semibold text-sm text-muted-foreground mb-3 pb-2 border-b border-white/5 flex justify-between">
                        {t("courseDetail.linkedGroups")} <Badge variant="secondary" className="bg-white/10">{course.groupLinks.length}</Badge>
                      </h4>
                      {course.groupLinks.length === 0 ? (
                        <div className="p-4 text-center border border-dashed border-white/10 rounded-lg text-muted-foreground text-sm">
                          {t("courseDetail.noLinkedGroups")}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {course.groupLinks.map((link: any) => (
                            <div key={link.id} className="flex justify-between items-center p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                              <div className="flex items-center gap-2">
                                <strong className="text-sm text-purple-300">{link.group.name}</strong>
                                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-purple-500/20 text-purple-300">{countNestedMembers(link.group)} {t("teacherDashboard.memberCount")}</Badge>
                              </div>
                              <Badge variant="outline" className="border-purple-500/30 text-purple-300">{t("courseDetail.isLinked")}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="sharing" className="mt-0">
          <Card className="glass-panel border-white/10 bg-white/5 max-w-3xl">
            <CardHeader>
              <CardTitle>{t("courseDetail.generateShareLink")}</CardTitle>
              <CardDescription>
                {t("courseDetail.generateShareLinkDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  className="bg-black/40 border-white/20 hover:border-white/30 focus-visible:ring-purple-500/50"
                  placeholder={t("courseDetail.linkLabelPlaceholder")}
                  value={newLinkLabel}
                  onChange={(e) => setNewLinkLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateJoinLink()}
                />
                <Button className="bg-purple-600 hover:bg-purple-700 text-white shrink-0" disabled={joinLinkBusy} onClick={handleCreateJoinLink}>
                  {joinLinkBusy ? t("common.submitting") : t("courseDetail.btnGenerateLink")}
                </Button>
              </div>
              
              {copyHint && (
                <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-md text-green-400 text-sm flex items-center gap-2">
                  <Check className="h-4 w-4" /> {copyHint}
                </div>
              )}

              <div className="mt-10">
                <h4 className="font-semibold text-sm text-muted-foreground mb-4 pb-2 border-b border-white/5 flex items-center justify-between">
                  {t("courseDetail.activeLinks")} <Badge variant="secondary" className="bg-white/10">{joinLinks.length}</Badge>
                </h4>
                {joinLinks.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-white/10 rounded-lg text-muted-foreground text-sm bg-black/20">
                    {t("courseDetail.noShareLinks")}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {joinLinks.map((link) => (
                      <div key={link.id} className="p-4 rounded-lg bg-black/40 border border-white/10 hover:border-purple-500/30 transition-all flex flex-col h-full group">
                        <div className="flex justify-between items-start mb-2">
                          <strong className="font-medium text-foreground">{link.label || t("courseDetail.noLabel")}</strong>
                          <span className={`w-2 h-2 rounded-full ${link.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1 mb-4 flex-1">
                          <p>{t("courseDetail.linkUses", { count: link.useCount })}</p>
                          {link.expiresAt && <p>{t("courseDetail.expiresAtLabel", { date: new Date(link.expiresAt).toLocaleDateString(locale) })}</p>}
                        </div>
                        
                        {link.status === "active" && link.joinUrl && (
                          <div className="flex gap-2 mt-auto">
                            <Button size="sm" className="flex-1 bg-white/10 hover:bg-white/20 text-foreground" onClick={() => void copyText(link.joinUrl!, t("courseDetail.copySuccess"))}>
                              <Copy className="h-3.5 w-3.5 mr-1" /> {t("courseDetail.btnCopy")}
                            </Button>
                            <Button size="sm" variant="destructive" className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border-0" disabled={joinLinkBusy} onClick={() => handleRevokeJoinLink(link.id)}>
                              {t("courseDetail.btnRevoke")}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="courseware" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Side: Upload / Add Courseware */}
            <Card className="glass-panel border-white/10 bg-white/5 lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-xl">{t("courseDetail.addCourseware")}</CardTitle>
                <CardDescription>{t("courseDetail.addCoursewareDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddCourseware} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">{t("courseDetail.coursewareName")}</label>
                    <Input
                      placeholder={t("courseDetail.coursewareNamePlaceholder")}
                      value={cwName}
                      onChange={(e) => setCwName(e.target.value)}
                      className="bg-black/40 border-white/20 hover:border-white/30 focus-visible:ring-purple-500/50"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">{t("courseDetail.fileUrl")}</label>
                    <Input
                      placeholder={t("courseDetail.fileUrlPlaceholder")}
                      value={cwUrl}
                      onChange={(e) => setCwUrl(e.target.value)}
                      className="bg-black/40 border-white/20 hover:border-white/30 focus-visible:ring-purple-500/50"
                    />
                    <p className="text-[10px] text-muted-foreground/60">
                      {t("courseDetail.fileUrlDesc")}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">{t("courseDetail.fileType")}</label>
                    <Select value={cwExt} onValueChange={setCwExt}>
                      <SelectTrigger className="bg-black/40 border-white/20 hover:border-white/30 focus-visible:ring-purple-500/50">
                        <SelectValue placeholder={t("courseDetail.fileType")} />
                      </SelectTrigger>
                      <SelectContent className="bg-background/95 border-white/10">
                        <SelectItem value="pptx">{t("courseDetail.fileTypePptx")}</SelectItem>
                        <SelectItem value="ppt">{t("courseDetail.fileTypePpt")}</SelectItem>
                        <SelectItem value="pdf">{t("courseDetail.fileTypePdf")}</SelectItem>
                        <SelectItem value="docx">{t("courseDetail.fileTypeDocx")}</SelectItem>
                        <SelectItem value="png">{t("courseDetail.fileTypeImage")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {cwError && (
                    <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20">
                      {cwError}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={cwAdding || !cwName.trim()}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {cwAdding ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("courseDetail.cwAdding")}
                      </span>
                    ) : (
                      t("courseDetail.btnCwAdd")
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Right Side: Courseware List */}
            <Card className="glass-panel border-white/10 bg-white/5 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-xl">{t("courseDetail.coursewareLibrary")}</CardTitle>
                <CardDescription>本节课程已绑定的课件。转换成功的课件将在{t("teacherDashboard.btnEnterClass")}后自动显示在“公共资源”云盘中。</CardDescription>
              </CardHeader>
              <CardContent>
                {courseware.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-lg bg-black/10">
                    <FileText className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">{t("courseDetail.noCourseware")}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">{t("courseDetail.addCoursewareHint")}</p>
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
                              <span>{t("courseDetail.formatLabel")}: {item.ext.toUpperCase()}</span>
                              <span>•</span>
                              <span>{t("courseDetail.sizeLabel")}: {item.size ? `${(item.size / 1024 / 1024).toFixed(2)} MB` : t("common.unknown")}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {item.taskStatus === "Finished" && (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              {t("courseDetail.convertSuccess")}
                            </Badge>
                          )}
                          {(item.taskStatus === "Converting" || item.taskStatus === "Pending") && (
                            <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              {t("courseDetail.converting")}
                            </Badge>
                          )}
                          {item.taskStatus === "Failed" && (
                            <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/30">
                              {t("courseDetail.convertFailed")}
                            </Badge>
                          )}

                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-purple-400 hover:text-purple-300 font-medium"
                          >
                            {t("courseDetail.originalFile")}
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="requirements" className="mt-0">
          <Card className="glass-panel border-white/10 bg-white/5 max-w-3xl">
            <CardHeader>
              <CardTitle>{t("courseDetail.tabs.requirementsStudent")}</CardTitle>
              <CardDescription>{t("courseDetail.studentRemarksDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {course.studentRemarks ? (
                <div className="relative p-8 rounded-xl bg-gradient-to-br from-blue-900/20 to-purple-900/20 border border-white/10">
                  <div className="absolute top-4 left-4 text-4xl text-white/10 font-serif leading-none">"</div>
                  <p className="relative z-10 text-lg text-foreground/90 leading-relaxed indent-4 px-2">
                    {course.studentRemarks}
                  </p>
                  <div className="absolute bottom-[-10px] right-4 text-4xl text-white/10 font-serif leading-none rotate-180">"</div>
                </div>
              ) : (
                <div className="p-12 text-center border border-dashed border-white/10 rounded-lg bg-black/20">
                  <Info className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">{t("courseDetail.studentRemarksEmpty")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
